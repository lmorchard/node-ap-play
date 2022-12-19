import crypto from "crypto";
import { URL } from "url";
import pino from "pino";
import axios from "axios";
import config from "../lib/config.js";
import { ActorModelStore } from "../lib/models.js";

export default function init({ program }) {
  program
    .command("send")
    .description("send message")
    .option("-f, --from <username>", "from username")
    .option("-t, --to <address>", "to address")
    .option("-m, --message <message>", "message to send")
    .action(run);
}

let actors;
let log;

async function run({ from, to, message }) {
  const { LOG_LEVEL, BASE_URL } = config;

  log = pino({
    level: LOG_LEVEL,
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  });

  actors = new ActorModelStore(config);
  
  const fromActor = await actors.fetch(from);
  log.debug({ msg: "fromActor", id: (await fromActor.toJSON()).id });

  const [username, hostname] = to.split("@", 2);
  const webfingerUrl = `https://${hostname}/.well-known/webfinger`;
  log.debug({ msg: "webfingerUrl", webfingerUrl });

  const webfingerResponse = await axios.get(webfingerUrl, {
    // snac2 needs `acct:` or else 404, whereas Mastodon & GTS seem not to
    params: { resource:`acct:${to}` },
  });
  log.debug({ msg: "webfingerResponse", data: webfingerResponse.data });

  const { links = [] } = webfingerResponse.data;
  const { href: toActor } = links.find(
    ({ rel, type }) => rel === "self" && type === "application/activity+json"
  );
  log.debug({ msg: "toActor", toActor });

  const date = new Date();

  const getSignHeaders = await signRequest({
    method: "get",
    url: toActor,
    actor: fromActor,
    date,
  });

  log.debug({ msg: "toActor get sign", toActor, ...getSignHeaders});

  const toActorResponse = await axios.get(toActor, {
    headers: { 
      accept: "application/activity+json", 
      ...getSignHeaders,
    },
  });

  log.debug({
    msg: "toActor RESPONSE",
    data: toActorResponse.data
  });

  const {
    id: toActorId,
    inbox: actorInbox,
    // gts doesn't have shared inbox
    // endpoints: { sharedInbox },
  } = toActorResponse.data;

  log.debug({
    msg: "toActor inbox",
    actorInbox,
  });

  const AS_TO_PUBLIC = "https://www.w3.org/ns/activitystreams#Public";

  const guidObject = crypto.randomBytes(16).toString("hex");
  let object = {
    id: `${BASE_URL}/objects/${guidObject}`,
    url: `${BASE_URL}/objects/${guidObject}`,
    type: "Note",
    published: date.toISOString(),
    attributedTo: fromActor.id,
    to: [AS_TO_PUBLIC],
    cc: [toActorId],
    tag: [
      {
        type: "Mention",
        // Mastodon is fine with just href
        href: toActor,
        // GTS pickily validates mention names!
        name: `@${to}`,
      }
    ],
    content: message,
  };

  const guidActivity = crypto.randomBytes(16).toString("hex");
  let activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${BASE_URL}/activities/${guidActivity}`,
    url: `${BASE_URL}/activities/${guidActivity}`,
    type: "Create",
    actor: fromActor.id,
    to: [AS_TO_PUBLIC],
    cc: [toActorId],
    object: object,
  };

  log.debug({ msg: "activity", activity });

  try {
    const inboxResponse = await axios({
      method: "post",
      url: actorInbox,
      data: activity,
      headers: {
        // GTS will NOT accept application/json like mastodon
        "Content-Type": "application/activity+json",
        ...(await signRequest({
          method: "post",
          url: actorInbox,
          actor: fromActor,
          date,
          content: JSON.stringify(activity),
        })),
      },
    });

    log.debug({
      msg: "inboxResponse",
      status: inboxResponse.status,
      data: inboxResponse.data,
    });
  } catch (error) {
    console.log(error);
    log.error({
      msg: "inboxResponse",
      code: error.code,
      data: error.data,
    });
  }
}

async function signRequest({ actor, method, url, date, content }) {
  const { pathname, host } = new URL(url);
  const dateUTC = date.toUTCString();

  const partsToSign = [
    `(request-target): ${method} ${pathname}`,
    `host: ${host}`,
    `date: ${dateUTC}`,
  ];

  const headers = {
    Host: host,
    Date: dateUTC,
  };
  const headersList = ["host", "date"];

  if (content) {
    const digestHash = crypto
      .createHash("sha256")
      .update(content)
      .digest("base64");
    partsToSign.push(`digest: SHA-256=${digestHash}`);
    headers["Digest"] = `SHA-256=${digestHash}`;
    headersList.push("digest");
  }

  const stringToSign = partsToSign.join("\n");

  const signer = crypto.createSign("sha256");
  signer.update(stringToSign);
  signer.end();

  const privkey = await actor.privateKey();
  const signature = signer.sign(privkey);
  const signatureB64 = signature.toString("base64");

  headers.Signature = [
    `keyId="${actor.keyId}"`,
    `headers="(request-target) ${headersList.join(" ")}"`,
    `signature="${signatureB64}"`,
  ].join(",");

  console.log("HEADERS", headers);
  return headers;
}

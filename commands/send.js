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

  const [username, hostname] = to.split("@", 2);
  const webfingerUrl = `https://${hostname}/.well-known/webfinger`;
  log.debug({ msg: "webfingerUrl", webfingerUrl });

  const webfingerResponse = await axios.get(webfingerUrl, {
    params: { resource: to },
  });
  log.debug({ msg: "webfingerResponse", data: webfingerResponse.data });

  const { links = [] } = webfingerResponse.data;
  const { href: toActor } = links.find(
    ({ rel, type }) => rel === "self" && type === "application/activity+json"
  );
  const { host: targetHost } = new URL(toActor);
  log.debug({ msg: "toActor", toActor });

  const toActorResponse = await axios.get(toActor, {
    headers: { accept: "application/activity+json" },
  });

  const {
    id: toActorId,
    inbox: actorInbox,
    endpoints: { sharedInbox },
  } = toActorResponse.data;

  log.debug({
    msg: "toActor inbox",
    actorInbox,
    sharedInbox,
  });

  const fromActor = await actors.fetch(from);
  log.debug({ msg: "fromActor", id: (await fromActor.toJSON()).id });

  const AS_TO_PUBLIC = "https://www.w3.org/ns/activitystreams#Public";

  const d = new Date();
  const dUTC = d.toUTCString();

  const guidObject = crypto.randomBytes(16).toString("hex");
  let object = {
    id: `${BASE_URL}/objects/${guidObject}`,
    type: "Note",
    published: d.toISOString(),
    attributedTo: fromActor.id,
    content: message,
    to: [AS_TO_PUBLIC],
  };

  const guidActivity = crypto.randomBytes(16).toString("hex");
  let activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${BASE_URL}/activities/${guidActivity}`,
    type: "Create",
    actor: fromActor.id,
    to: [AS_TO_PUBLIC],
    cc: [toActorId],
    object: object,
  };

  log.debug({ msg: "activity", activity });

  const {
    href: targetInbox,
    pathname: targetInboxPath,
    host: targetInboxHost,
  } = new URL(actorInbox);

  const digestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(activity))
    .digest("base64");

  let stringToSign = `(request-target): post ${targetInboxPath}\nhost: ${targetInboxHost}\ndate: ${dUTC}\ndigest: SHA-256=${digestHash}`;

  const signer = crypto.createSign("sha256");
  signer.update(stringToSign);
  signer.end();

  const privkey = await fromActor.privateKey();
  const signature = signer.sign(privkey);
  const signatureB64 = signature.toString("base64");
  const header = `keyId="${fromActor.keyId}",headers="(request-target) host date digest",signature="${signatureB64}"`;

  log.debug({ msg: "signature", stringToSign, signatureB64, header });

  try {
    const inboxResponse = await axios({
      method: "post",
      url: targetInbox,
      data: activity,
      headers: {
        Host: targetHost,
        Date: dUTC,
        Digest: `SHA-256=${digestHash}`,
        Signature: header,
      },
    });

    log.debug({
      msg: "inboxResponse",
      status: inboxResponse.status,
      data: inboxResponse.data,
    });
  } catch (error) {
    log.error({
      msg: "inboxResponse",
      error,
      // code: error.code,
      // data: error.data,
    });
  }
}

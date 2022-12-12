/*
TODO:
- webfinger lookup
- actor JSON
- inbox endpoint
- outbox feed
- outgoing POST queue
- c2s API?
*/
import path from "path";
import { URL } from "url";

import Fastify from "fastify";
import FastifyStatic from "@fastify/static";
import FastifyAccepts from "@fastify/accepts";
import Boom from "@hapi/boom";

import config from "../lib/config.js";
import { ActorModelStore } from "../lib/models.js";

let server;
let actors;

export default function init({ program }) {
  program.command("server").description("run server").action(run);
}

async function run() {
  const { LOG_LEVEL, PUBLIC_PATH, HOST, PORT } = config;
  actors = new ActorModelStore(config);

  server = Fastify({
    logger: { level: LOG_LEVEL },
  });

  server
    .register(FastifyStatic, {
      root: path.resolve(PUBLIC_PATH),
      prefix: "/",
    })
    .register(FastifyAccepts);

  // TODO: split this up into plugins - e.g. to use hooks to check :actor existence across all handlers
  server
    .get("/.well-known/webfinger", getWebFinger)
    .get("/actors/:username/icon", getActorIcon)
    .get("/actors/:username", getActor)
    .post("/inbox", postSharedInbox)
    .post("/actors/:username/inbox", postActorInbox);

  server.listen({ host: HOST, port: PORT });
}

// e.g. acct:user@example.com
const RE_WEBFINGER = new RegExp(
  "(?<scheme>[^:]+):(?<username>[^@]+)@(?<hostname>.+)"
);

async function getWebFinger(request, reply) {
  const { BASE_URL } = config;
  const { resource } = request.query;

  const match = RE_WEBFINGER.exec(resource);
  if (!match) {
    return reply.send(Boom.notAcceptable("unacceptable webfinger query"));
  }

  const { scheme, username, hostname } = match.groups;

  const siteDomain = new URL(BASE_URL).host;
  if (scheme !== "acct" || hostname !== siteDomain) {
    return reply.send(Boom.notAcceptable("unacceptable scheme or hostname"));
  }

  const exists = await actors.exists(username);
  if (!exists) {
    return reply.send(Boom.notFound("username not found"));
  }

  const webfingerResponse = {
    subject: resource,
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `${BASE_URL}/actors/${username}`,
      },
    ],
  };

  return reply
    .code(200)
    .headers({
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/jrd+json",
    })
    .send(webfingerResponse);
}

async function getActor(request, reply) {
  const { username } = request.params;

  const exists = await actors.exists(username);
  if (!exists) {
    return reply.send(Boom.notFound("actor not found"));
  }

  const actor = await actors.fetch(username);

  const accept = request.accepts();
  switch (accept.type(["application/activity+json", "json", "html"])) {
    case "application/activity+json":
    case "json":
      return reply.type("application/activity+json").send(await actor.toJSON());
    case "html":
      reply.type("text/html").send("<b>hello, world!</b>");
      break;
  }
}

async function getActorIcon(request, reply) {
  const { username } = request.params;

  const exists = await actors.exists(username);
  if (!exists) {
    return reply.send(Boom.notFound("actor not found"));
  }

  const actor = await actors.fetch(username);
  // TOOD: serving this file up directly like this is a little dicey
  return reply.sendFile(actor.iconFilePath, { root: "/" });
}

async function postSharedInbox(request, reply) {}

async function postActorInbox(request, reply) {}

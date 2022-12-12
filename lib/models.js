import fs from "fs/promises";
import path from "path";

export class ActorModelStore {
  constructor(config) {
    this.config = config;
  }

  actorPath(username) {
    return path.resolve(this.config.ACTORS_PATH, `${username}`);
  }

  async exists(username) {
    try {
      const actorPath = this.actorPath(username);
      const actorJSONPath = path.join(actorPath, "actor.json");
      await fs.access(actorJSONPath, fs.constants.R_OK | fs.constants.W_OK);
      const stat = await fs.stat(actorJSONPath);
      return stat.isFile();
    } catch (err) {
      return false;
    }
  }

  async fetch(username) {
    const actorPath = this.actorPath(username);
    return new ActorModel({
      config: this.config,
      username,
      actorPath,
    });
  }
}

export class ActorModel {
  constructor(data) {
    Object.assign(this, data);
  }

  async toJSON() {
    const { BASE_URL } = this.config;
    return {
      "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://w3id.org/security/v1",
      ],
      id: this.id,
      url: this.url,
      inbox: `${this.actorBaseUrl}/inbox`,
      following: `${this.actorBaseUrl}/following`,
      followers: `${this.actorBaseUrl}/followers`,
      discoverable: true,
      manuallyApprovesFollowers: true,
      endpoints: {
        sharedInbox: `${BASE_URL}/inbox`,
      },
      publicKey: {
        id: this.keyId,
        owner: this.id,
        publicKeyPem: await this.publicKey(),
      },
      icon: {
        type: "Image",
        mediaType: "image/png",
        url: this.iconUrl,
      },
      ...(await this.props()),
    };
  }

  get actorBaseUrl() {
    return `${this.config.BASE_URL}/actors/${this.username}`;
  }

  get id() {
    return this.actorBaseUrl
  }

  get url() {
    return this.actorBaseUrl
  }

  get keyId() {
    return `${this.actorBaseUrl}#main-key`
  }

  actorFilePath(filename) {
    return path.join(this.actorPath, filename);
  }

  async readActorFile(filename) {
    const contentPath = this.actorFilePath(filename);
    const content = await fs.readFile(contentPath);
    return content.toString();
  }

  async props() {
    const jsonContent = await this.readActorFile("actor.json");
    return JSON.parse(jsonContent);
  }

  async publicKey() {
    return this.readActorFile("public.pem");
  }

  async privateKey() {
    return this.readActorFile("private.pem");
  }

  get iconUrl() {
    return `${this.actorBaseUrl}/icon`
  }

  get iconFilePath() {
    return this.actorFilePath("icon.png");
  }
}

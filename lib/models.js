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
    return this.id
    // TODO: serve up a redacted version of the actor with just key info like GTS?
    /*
      {
      "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://w3id.org/security/v1"
      ],
      "id": "https://gts-dev.sish.decafbad.com/users/lmorchard",
      "preferredUsername": "lmorchard",
      "publicKey": {
        "id": "https://gts-dev.sish.decafbad.com/users/lmorchard/main-key",
        "owner": "https://gts-dev.sish.decafbad.com/users/lmorchard",
        "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4RPw26Ic4KeR3JKxoEsX\n54vbq9TjVw2lbABHLyIMAPfgj+lwl3XTWu+FeQn0BiOPEuYUKwmKMy7HBE5OgrUy\nut1FzTUiQzvM0G8dIYqxIlOOyMqxsNfsJBxFW/6AFnAPtVGRiMt6+AAEvc+VHqXd\nhBKnK3aUutL5B7IFwcnqZmKkptlmObPvqD0v2D1FCWKLjg1uW6eioPLGkK8g42/B\nvVEIuYuttYrH1ztGYVQJZ2j9JBdjqKgD2rgHj/wcYIvWhkCKKspHNfTUe0XJrgof\ntVREbyr6IJp4IyDl+63d2qO6Ut3aThrtl/J0aEGQv/5kNo0tUexHMFRZ7MYY5oHW\nowIDAQAB\n-----END PUBLIC KEY-----\n"
      },
      "type": "Person"
    }
    */
    // return `${this.id}#main-key`
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

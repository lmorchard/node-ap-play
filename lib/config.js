import * as dotenv from "dotenv";

const config = {};

export function init(context) {
  const { program } = context;
  dotenv.config();

  const {
    HOST = "0.0.0.0",
    PORT = 3001,
    BASE_URL = "http://localhost:3001",
    LOG_LEVEL = "debug",
    PUBLIC_PATH = "public",
    ACTORS_PATH = "./actors",
  } = process.env;

  Object.assign(config, {
    VERSION: "1.0.0",
    HOST,
    PORT,
    BASE_URL,
    LOG_LEVEL,
    PUBLIC_PATH,
    ACTORS_PATH,
  });

  program.version(config.VERSION);

  context.config = config;
}

export default config;

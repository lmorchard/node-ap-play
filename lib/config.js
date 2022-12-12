import * as dotenv from "dotenv";

dotenv.config();

const {
  HOST = "0.0.0.0",
  PORT = 3001,
  BASE_URL = "http://localhost:3001",
  LOG_LEVEL = "debug",
  PUBLIC_PATH = "public",
  ACTORS_PATH = "./actors",
} = process.env;

export default {
  HOST,
  PORT,
  BASE_URL,
  LOG_LEVEL,
  PUBLIC_PATH,
  ACTORS_PATH,
};

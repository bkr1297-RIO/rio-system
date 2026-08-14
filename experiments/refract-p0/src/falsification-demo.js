import { runFalsificationPack } from "./falsify.js";

process.stdout.write(JSON.stringify(runFalsificationPack(), null, 2) + "\n");

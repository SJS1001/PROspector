import { enrollOwner } from "./local-owner.mjs";

async function passwordInput() {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 130) throw new Error("Password input is too long.");
    }
    return input.replace(/\r?\n$/, "");
  }
  process.stderr.write("Local owner password (16–128 characters; hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let password = "";
    const done = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003" || char === "\u0004") return done(new Error("Cancelled."));
        if (char === "\r" || char === "\n") return done();
        if (char === "\u007f" || char === "\b") password = password.slice(0, -1);
        else if (char >= " " && password.length < 129) password += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
try {
  if (process.argv.slice(2).some((arg) => arg !== "--reset-password"))
    throw new Error("Only --reset-password is supported. Never pass a password as an argument.");
  await enrollOwner(await passwordInput(), process.argv.includes("--reset-password"));
  console.log("Local owner configured. Start with npm start and open http://127.0.0.1:8080.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

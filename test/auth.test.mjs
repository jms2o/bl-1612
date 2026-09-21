import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, parseCookies, secureStringEqual, verifySessionToken } from "../lib/auth.mjs";

const secret = "una-clave-de-prueba-con-mas-de-32-caracteres";

test("crea y valida una sesión firmada", () => {
  const token = createSessionToken("joel", secret, 1_000);
  const session = verifySessionToken(token, secret, 2_000);
  assert.equal(session.username, "joel");
});

test("rechaza sesiones manipuladas o vencidas", () => {
  const token = createSessionToken("joel", secret, 1_000);
  assert.equal(verifySessionToken(`${token}x`, secret, 2_000), null);
  assert.equal(verifySessionToken(token, secret, 50_000_000), null);
});

test("analiza cookies y compara credenciales", () => {
  assert.deepEqual(parseCookies("tema=oscuro; sesion=abc%20123"), { tema: "oscuro", sesion: "abc 123" });
  assert.equal(secureStringEqual("secreto", "secreto"), true);
  assert.equal(secureStringEqual("secreto", "otro"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { allowedOrigin, safeReturn } from "./lib/http.ts";

test("return targets stay on the trips page of this host or travaglino.me", () => {
  const self = "https://reader.example";
  assert.equal(safeReturn(null, self).href, "https://reader.example/trips");
  assert.equal(safeReturn("https://evil.example/trips", self).href, "https://reader.example/trips");
  assert.equal(safeReturn("https://travaglino.me/trips?x=1", self).href, "https://travaglino.me/trips");
  assert.equal(safeReturn("https://reader.example/steal", self).href, "https://reader.example/trips");
  assert.equal(safeReturn("http://127.0.0.1:3000/trips", "http://127.0.0.1:3000").href, "http://127.0.0.1:3000/trips");
});

test("browser calls are accepted from the site and from this host", () => {
  assert.equal(allowedOrigin("https://travaglino.me", "https://reader.example"), true);
  assert.equal(allowedOrigin("https://evil.example", "https://reader.example"), false);
  assert.equal(allowedOrigin("http://127.0.0.1:43123", "http://127.0.0.1:3000"), true);
  assert.equal(allowedOrigin("http://127.0.0.1:43123", "https://reader.example"), false);
});

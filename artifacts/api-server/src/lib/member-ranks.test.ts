import assert from "node:assert/strict";
import test from "node:test";
import {
  accessRoleForRank,
  canonicalFactionRank,
  titleForMember,
} from "./member-ranks.ts";

test("the six available titles map to the intended access roles", () => {
  assert.equal(accessRoleForRank("Администратор"), "admin");
  assert.equal(accessRoleForRank("Лидер"), "leader");
  assert.equal(accessRoleForRank("Вице-Губернатор"), "employee");
  assert.equal(accessRoleForRank("Депутат"), "employee");
  assert.equal(accessRoleForRank("Адвокат"), "employee");
  assert.equal(accessRoleForRank("Лицензер"), "employee");
});

test("rank input is normalized to a supported title", () => {
  assert.equal(canonicalFactionRank(" вице—губернатор "), "Вице-Губернатор");
  assert.equal(canonicalFactionRank("лицензёр"), "Лицензер");
  assert.equal(canonicalFactionRank("Сотрудник"), undefined);
});

test("privileged access roles display as their title rather than a second rank", () => {
  assert.equal(titleForMember("leader", "Старое звание"), "Лидер");
  assert.equal(titleForMember("admin", "Старое звание"), "Администратор");
  assert.equal(titleForMember("employee", "Адвокат"), "Адвокат");
});

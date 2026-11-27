import { describe, expect, it } from "vitest";
import { parseTeacherEmails, resolveRole } from "./roles";

describe("parseTeacherEmails", () => {
  it("splits, trims and lowercases", () => {
    expect([...parseTeacherEmails(" Teacher@Gmail.com , other@school.edu.tw,,")]).toEqual([
      "teacher@gmail.com",
      "other@school.edu.tw",
    ]);
  });

  it("returns an empty set when unset", () => {
    expect(parseTeacherEmails(undefined).size).toBe(0);
  });
});

describe("resolveRole", () => {
  const teachers = parseTeacherEmails("teacher@gmail.com");

  it("gives TEACHER to listed emails regardless of case", () => {
    expect(resolveRole("Teacher@Gmail.com", teachers)).toBe("TEACHER");
  });

  it("gives STUDENT to everyone else", () => {
    expect(resolveRole("student@gmail.com", teachers)).toBe("STUDENT");
  });
});

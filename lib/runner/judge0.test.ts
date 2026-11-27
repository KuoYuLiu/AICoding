import { describe, expect, it } from "vitest";
import { judge0Headers } from "./judge0";

describe("judge0Headers", () => {
  it("uses X-Auth-Token for a self-hosted Judge0", () => {
    expect(judge0Headers("https://judge0.example.edu", "k")).toEqual({ "Content-Type": "application/json", "X-Auth-Token": "k" });
  });

  it("uses RapidAPI headers for the RapidAPI-hosted Judge0 CE", () => {
    expect(judge0Headers("https://judge0-ce.p.rapidapi.com", "k")).toEqual({
      "Content-Type": "application/json",
      "X-RapidAPI-Key": "k",
      "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
    });
  });

  it("sends no key when none is set", () => {
    expect(judge0Headers("http://localhost:2358")).toEqual({ "Content-Type": "application/json" });
  });
});

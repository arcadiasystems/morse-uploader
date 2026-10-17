import { describe, expect, it } from "vitest";
import { addProfile } from "./add-profile";
import { findProfile } from "./find-profile";
import { parseProfiles } from "./parse-profiles";
import type { Profile, ProfileDraft } from "./profile";
import { removeProfile } from "./remove-profile";
import { serializeProfiles } from "./serialize-profiles";

const ADDRESS =
	"0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75";
const OTHER =
	"0x00000000000000000000000000000000000000000000000000000000000000ab";

const draft = (overrides: Partial<ProfileDraft> = {}): ProfileDraft => ({
	name: "Nikola",
	walletId: "slush",
	walletName: "Slush",
	address: ADDRESS,
	network: "testnet",
	...overrides,
});

function added(
	profiles: readonly Profile[],
	input: ProfileDraft,
	id: string,
): Profile[] {
	const result = addProfile(profiles, input, id);
	if (!result.ok) throw new Error(`expected ${input.name} to be added`);
	return result.profiles;
}

describe("addProfile", () => {
	it("adds a profile with a normalized name and address", () => {
		const result = addProfile(
			[],
			draft({ name: "  My   wallet ", address: "0xab" }),
			"a",
		);
		expect(result).toEqual({
			ok: true,
			profile: { ...draft(), id: "a", name: "My wallet", address: OTHER },
			profiles: [{ ...draft(), id: "a", name: "My wallet", address: OTHER }],
		});
	});

	it("caps names at 40 characters and refuses empty ones", () => {
		const result = addProfile([], draft({ name: "x".repeat(60) }), "a");
		expect(result.ok && result.profile.name).toBe("x".repeat(40));
		expect(addProfile([], draft({ name: "   " }), "a")).toEqual({
			ok: false,
			reason: "empty-name",
		});
	});

	it("saves a wallet, address and network pair once", () => {
		const profiles = added([], draft(), "a");
		const again = addProfile(
			profiles,
			draft({
				name: "Again",
				address: ADDRESS.toUpperCase().replace("0X", "0x"),
			}),
			"b",
		);
		expect(again).toEqual({
			ok: false,
			reason: "duplicate",
			existing: profiles[0],
		});
	});

	it("treats the same address on another network or wallet as a new profile", () => {
		const profiles = added(
			added([], draft(), "a"),
			draft({ network: "mainnet" }),
			"b",
		);
		expect(added(profiles, draft({ walletId: "phantom" }), "c")).toHaveLength(
			3,
		);
	});
});

describe("findProfile and removeProfile", () => {
	const profiles = added(
		added([], draft(), "a"),
		draft({ name: "Main", network: "mainnet" }),
		"b",
	);

	it("finds the profile for a session", () => {
		expect(
			findProfile(profiles, {
				walletId: "slush",
				address: ADDRESS,
				network: "mainnet",
			})?.id,
		).toBe("b");
		expect(
			findProfile(profiles, {
				walletId: "slush",
				address: OTHER,
				network: "testnet",
			}),
		).toBeUndefined();
	});

	it("removes by id and leaves the rest", () => {
		expect(removeProfile(profiles, "a").map((profile) => profile.id)).toEqual([
			"b",
		]);
		expect(removeProfile(profiles, "missing")).toEqual(profiles);
	});
});

describe("parseProfiles and serializeProfiles", () => {
	const profiles = added(
		added([], draft(), "a"),
		draft({ name: "Main", network: "mainnet" }),
		"b",
	);

	it("round-trips the stored form", () => {
		expect(parseProfiles(serializeProfiles(profiles))).toEqual(profiles);
	});

	it("rejects documents that are not a version 1 profile list", () => {
		expect(parseProfiles("not json")).toBeNull();
		expect(parseProfiles(JSON.stringify(profiles))).toBeNull();
		expect(parseProfiles(JSON.stringify({ version: 2, profiles }))).toBeNull();
		expect(
			parseProfiles(JSON.stringify({ version: 1, profiles: "none" })),
		).toBeNull();
	});

	it("drops malformed and repeated entries", () => {
		const stored = JSON.stringify({
			version: 1,
			profiles: [
				profiles[0],
				{ ...profiles[0], id: "copy" },
				{ ...profiles[1], network: "devnet" },
				{ ...profiles[1], address: "not an address" },
				{ ...profiles[1], name: "  " },
				{ ...profiles[1], id: "" },
				null,
				"profile",
			],
		});
		expect(parseProfiles(stored)).toEqual([profiles[0]]);
	});
});

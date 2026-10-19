import { faker } from "@faker-js/faker";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserPostalCodeResolver } from "~/src/graphql/types/User/postalCode";
import type { User as UserType } from "~/src/graphql/types/User/User";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

describe("User.postalCode resolver", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should throw 'unauthenticated' error if user is not authenticated", async () => {
		const { context } = createMockGraphQLContext(false);
		const parent = {
			id: faker.string.uuid(),
			postalCode: faker.location.zipCode(),
		};

		await expect(
			UserPostalCodeResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthenticated",
				}),
			}),
		);
	});

	it("should throw 'unauthenticated' error if current user is not found", async () => {
		const { context, mocks } = createMockGraphQLContext(true);
		const parent = {
			id: faker.string.uuid(),
			postalCode: faker.location.zipCode(),
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(undefined);

		await expect(
			UserPostalCodeResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthenticated",
				}),
			}),
		);
	});

	it("should throw 'unauthorized_action' error if regular user accesses another user's postalCode", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: faker.string.uuid(),
			postalCode: faker.location.zipCode(),
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		await expect(
			UserPostalCodeResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthorized_action",
				}),
			}),
		);
	});

	it("should return postalCode if user is administrator", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: faker.string.uuid(),
			postalCode: "10001",
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "administrator",
		});

		const result = await UserPostalCodeResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).toBe(parent.postalCode);
	});

	it("should return postalCode if user accesses their own data", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: currentUserId,
			postalCode: "90210",
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await UserPostalCodeResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).toBe(parent.postalCode);
	});

	it("should escape HTML characters in the returned postalCode", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const unsafePostalCode = "<script>alert('xss')</script>";
		const parent = {
			id: currentUserId,
			postalCode: unsafePostalCode,
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await UserPostalCodeResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).not.toContain("<script>");
		expect(result).toContain("&lt;script&gt;");
	});

	it("should return null when postalCode is null", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: currentUserId,
			postalCode: null,
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await UserPostalCodeResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).toBeNull();
	});

	it("should return empty string when postalCode is empty", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: currentUserId,
			postalCode: "",
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await UserPostalCodeResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).toBe("");
	});

	it("should rethrow TalawaGraphQLError from database layer without logging", async () => {
		const { context, mocks } = createMockGraphQLContext(true);
		const parent = {
			id: faker.string.uuid(),
			postalCode: faker.location.zipCode(),
		};

		const talawaError = new TalawaGraphQLError({
			extensions: { code: "unauthenticated" },
		});

		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			talawaError,
		);

		await expect(
			UserPostalCodeResolver(parent as UserType, {}, context),
		).rejects.toBe(talawaError);
		expect(context.log.error).not.toHaveBeenCalled();
	});

	it("should log and wrap unknown database errors", async () => {
		const { context, mocks } = createMockGraphQLContext(true);
		const parent = {
			id: faker.string.uuid(),
			postalCode: faker.location.zipCode(),
		};

		const unknownError = new Error("DB connection failure");

		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			unknownError,
		);

		await expect(
			UserPostalCodeResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({ code: "unexpected" }),
			}),
		);

		expect(context.log.error).toHaveBeenCalledWith(unknownError);
	});
});

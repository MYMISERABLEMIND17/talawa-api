import { faker } from "@faker-js/faker";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { homePhoneNumberResolver } from "~/src/graphql/types/User/homePhoneNumber";
import type { User as UserType } from "~/src/graphql/types/User/User";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

describe("User.homePhoneNumber resolver", () => {
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
			homePhoneNumber: faker.phone.number(),
		};

		await expect(
			homePhoneNumberResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthenticated",
				}),
			}),
		);
	});

	it("should throw 'unauthenticated' error if current user is not found in database", async () => {
		const { context, mocks } = createMockGraphQLContext(true);
		const parent = {
			id: faker.string.uuid(),
			homePhoneNumber: faker.phone.number(),
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(undefined);

		await expect(
			homePhoneNumberResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthenticated",
				}),
			}),
		);
	});

	it("should throw 'unauthorized_action' error if regular user accesses another user's homePhoneNumber", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: faker.string.uuid(),
			homePhoneNumber: faker.phone.number(),
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		await expect(
			homePhoneNumberResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthorized_action",
				}),
			}),
		);
	});

	it("should return homePhoneNumber if user accesses their own data", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const expectedPhone = "+1-800-555-0199";
		const parent = {
			id: currentUserId,
			homePhoneNumber: expectedPhone,
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await homePhoneNumberResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).toBe(expectedPhone);
	});

	it("should return homePhoneNumber if user is administrator accessing another user's data", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const expectedPhone = "+1-800-555-0144";
		const parent = {
			id: faker.string.uuid(),
			homePhoneNumber: expectedPhone,
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "administrator",
		});

		const result = await homePhoneNumberResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).toBe(expectedPhone);
	});

	it("should return null when homePhoneNumber is null", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: currentUserId,
			homePhoneNumber: null,
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await homePhoneNumberResolver(
			parent as UserType,
			{},
			context,
		);
		expect(result).toBeNull();
	});

	it("should return empty string when homePhoneNumber is empty", async () => {
		const currentUserId = faker.string.uuid();
		const { context, mocks } = createMockGraphQLContext(true, currentUserId);
		const parent = {
			id: currentUserId,
			homePhoneNumber: "",
		};

		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await homePhoneNumberResolver(
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
			homePhoneNumber: faker.phone.number(),
		};

		const talawaError = new TalawaGraphQLError({
			extensions: { code: "unauthenticated" },
		});

		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			talawaError,
		);

		await expect(
			homePhoneNumberResolver(parent as UserType, {}, context),
		).rejects.toBe(talawaError);
		expect(context.log.error).not.toHaveBeenCalled();
	});

	it("should log and wrap unknown database errors into an unexpected error", async () => {
		const { context, mocks } = createMockGraphQLContext(true);
		const parent = {
			id: faker.string.uuid(),
			homePhoneNumber: faker.phone.number(),
		};

		const unknownError = new Error("Database network failure");

		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			unknownError,
		);

		await expect(
			homePhoneNumberResolver(parent as UserType, {}, context),
		).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({ code: "unexpected" }),
			}),
		);

		expect(context.log.error).toHaveBeenCalledWith(unknownError);
	});
});

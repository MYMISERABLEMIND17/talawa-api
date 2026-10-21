import { faker } from "@faker-js/faker";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import { educationGradeResolver } from "~/src/graphql/types/User/educationGrade";
import type { User as UserType } from "~/src/graphql/types/User/User";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

describe("User.educationGrade resolver", () => {
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];
	let parent: UserType;
	let currentUserId: string;

	beforeEach(() => {
		vi.clearAllMocks();
		currentUserId = faker.string.uuid();
		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			currentUserId,
		);
		ctx = context;
		mocks = newMocks;

		parent = {
			id: currentUserId,
			name: faker.person.fullName(),
			emailAddress: faker.internet.email(),
			isEmailAddressVerified: true,
			educationGrade: "grade_12",
			role: "regular",
			createdAt: new Date("2025-01-01T10:00:00Z"),
			updatedAt: null,
			creatorId: faker.string.uuid(),
			updaterId: null,
		} as UserType;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should throw 'unauthenticated' error if user is not authenticated", async () => {
		const { context: unauthCtx } = createMockGraphQLContext(false);

		await expect(educationGradeResolver(parent, {}, unauthCtx)).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthenticated",
				}),
			}),
		);
	});

	it("should throw 'unauthenticated' error if current user is not found in database", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(undefined);

		await expect(educationGradeResolver(parent, {}, ctx)).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthenticated",
				}),
			}),
		);
	});

	it("should throw 'unauthorized_action' error if regular user accesses another user's educationGrade", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const otherUser = {
			...parent,
			id: faker.string.uuid(),
		} as UserType;

		await expect(educationGradeResolver(otherUser, {}, ctx)).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unauthorized_action",
				}),
			}),
		);
	});

	it("should return educationGrade if user accesses their own data", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const result = await educationGradeResolver(parent, {}, ctx);

		expect(result).toBe("grade_12");
	});

	it("should return educationGrade if user is administrator accessing another user's data", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "administrator",
		});

		const otherUser = {
			...parent,
			id: faker.string.uuid(),
			educationGrade: "graduate",
		} as UserType;

		const result = await educationGradeResolver(otherUser, {}, ctx);

		expect(result).toBe("graduate");
	});

	it("should return null when educationGrade is null", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const nullGradeParent = {
			...parent,
			educationGrade: null,
		} as UserType;

		const result = await educationGradeResolver(nullGradeParent, {}, ctx);

		expect(result).toBeNull();
	});

	it("should return correct educationGrade value when populated with a different grade", async () => {
		mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
			role: "regular",
		});

		const grade1Parent = {
			...parent,
			educationGrade: "grade_1",
		} as UserType;

		const result = await educationGradeResolver(grade1Parent, {}, ctx);

		expect(result).toBe("grade_1");
	});

	it("should rethrow TalawaGraphQLError from database layer without logging", async () => {
		const talawaError = new TalawaGraphQLError({
			extensions: { code: "unauthenticated" },
		});

		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			talawaError,
		);

		await expect(educationGradeResolver(parent, {}, ctx)).rejects.toBe(
			talawaError,
		);

		expect(ctx.log.error).not.toHaveBeenCalled();
	});

	it("should log and wrap unknown database errors into an unexpected error", async () => {
		const unknownError = new Error("Database connection failure");

		mocks.drizzleClient.query.usersTable.findFirst.mockRejectedValue(
			unknownError,
		);

		await expect(educationGradeResolver(parent, {}, ctx)).rejects.toThrow(
			expect.objectContaining({
				extensions: expect.objectContaining({
					code: "unexpected",
				}),
			}),
		);

		expect(ctx.log.error).toHaveBeenCalledWith(unknownError);
	});
});

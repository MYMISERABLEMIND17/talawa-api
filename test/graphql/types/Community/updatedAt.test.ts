import { faker } from "@faker-js/faker";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { communityUpdatedAtResolver } from "~/src/graphql/types/Community/updatedAt";
import envConfig from "~/src/utilities/graphqLimits";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import { createMockGraphQLContext } from "../../../_Mocks_/mockContextCreator/mockContextCreator";

const { implementSpy } = vi.hoisted(() => {
	const implement = vi.fn();
	return { implementSpy: implement };
});

vi.mock("~/src/graphql/types/Community/Community", () => ({
	Community: {
		implement: implementSpy,
	},
}));

type CommunityFieldMap = {
	updatedAt: {
		description: string;
		type: string;
		complexity: number;
		resolve: typeof communityUpdatedAtResolver;
	};
};

describe("Community.updatedAt Field and Resolver", () => {
	let fields: CommunityFieldMap;

	beforeAll(async () => {
		await import("~/src/graphql/types/Community/updatedAt");

		const implementConfig = implementSpy.mock.calls[0]?.[0];
		const fieldsFactory = implementConfig.fields as (
			t: unknown,
		) => CommunityFieldMap;

		const tStub = {
			field: vi.fn((opts) => opts),
		};

		fields = fieldsFactory(tStub);
	});

	it("implements the updatedAt field on Community with correct metadata", () => {
		expect(fields.updatedAt.description).toBe(
			"Date time at the time the community was last updated.",
		);
		expect(fields.updatedAt.type).toBe("DateTime");
		expect(fields.updatedAt.complexity).toBe(
			envConfig.API_GRAPHQL_SCALAR_RESOLVER_FIELD_COST,
		);
		expect(fields.updatedAt.resolve).toBe(communityUpdatedAtResolver);
	});

	describe("communityUpdatedAtResolver", () => {
		it("throws unauthenticated error when client is not authenticated", async () => {
			const { context } = createMockGraphQLContext(false);
			const parent = { updatedAt: new Date() };

			await expect(
				communityUpdatedAtResolver(parent, {}, context),
			).rejects.toThrow(
				new TalawaGraphQLError({
					extensions: {
						code: "unauthenticated",
					},
				}),
			);
		});

		it("throws unauthenticated error when current user is not found in database", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const parent = { updatedAt: new Date() };

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue(
				undefined,
			);

			await expect(
				communityUpdatedAtResolver(parent, {}, context),
			).rejects.toThrow(
				new TalawaGraphQLError({
					extensions: {
						code: "unauthenticated",
					},
				}),
			);
		});

		it("throws unauthorized_action error when user is not an administrator", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const parent = { updatedAt: new Date() };

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				role: "member",
			});

			await expect(
				communityUpdatedAtResolver(parent, {}, context),
			).rejects.toThrow(
				new TalawaGraphQLError({
					extensions: {
						code: "unauthorized_action",
					},
				}),
			);
		});

		it("returns parent.updatedAt when user is an administrator", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const expectedDate = faker.date.recent();
			const parent = { updatedAt: expectedDate };

			mocks.drizzleClient.query.usersTable.findFirst.mockImplementation(
				(options?: {
					where?: (
						fields: unknown,
						operators: { eq: (a: unknown, b: unknown) => unknown },
					) => unknown;
				}) => {
					if (typeof options?.where === "function") {
						options.where({ id: "id" }, { eq: vi.fn() });
					}
					return Promise.resolve({
						role: "administrator",
					});
				},
			);

			const result = await communityUpdatedAtResolver(parent, {}, context);

			expect(
				mocks.drizzleClient.query.usersTable.findFirst,
			).toHaveBeenCalledTimes(1);
			expect(result).toBe(expectedDate);
		});

		it("returns null when parent.updatedAt is null", async () => {
			const { context, mocks } = createMockGraphQLContext(true);
			const parent = { updatedAt: null };

			mocks.drizzleClient.query.usersTable.findFirst.mockResolvedValue({
				role: "administrator",
			});

			const result = await communityUpdatedAtResolver(parent, {}, context);

			expect(result).toBeNull();
		});
	});
});

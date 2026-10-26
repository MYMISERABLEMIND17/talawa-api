import { faker } from "@faker-js/faker";
import type {
	GraphQLFieldResolver,
	GraphQLObjectType,
	GraphQLResolveInfo,
} from "graphql";
import { createMockGraphQLContext } from "test/_Mocks_/mockContextCreator/mockContextCreator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLContext } from "~/src/graphql/context";
import "~/src/graphql/scalars";
import { schema } from "~/src/graphql/schema";
import type { Fund as FundType } from "~/src/graphql/types/Fund/Fund";
import "~/src/graphql/types/Fund/Fund";
import "~/src/graphql/types/Fund/campaigns";
import { campaignsComplexity } from "~/src/graphql/types/Fund/campaigns";
import type { FundCampaign as FundCampaignType } from "~/src/graphql/types/FundCampaign/FundCampaign";
import "~/src/graphql/types/FundCampaign/FundCampaign";
import envConfig from "~/src/utilities/graphqLimits";
import type { DefaultGraphQLConnection as Connection } from "~/src/utilities/graphqlConnection";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

const fundType = schema.getType("Fund") as GraphQLObjectType;
const campaignsField = fundType.getFields().campaigns;
if (!campaignsField?.resolve) {
	throw new Error("campaigns field or resolver not found on Fund schema");
}
const resolveCampaigns = campaignsField.resolve as GraphQLFieldResolver<
	FundType,
	GraphQLContext
>;

describe("Fund Resolver - campaigns", () => {
	let mockFund: FundType;
	let ctx: GraphQLContext;
	let mocks: ReturnType<typeof createMockGraphQLContext>["mocks"];

	beforeEach(() => {
		const { context, mocks: newMocks } = createMockGraphQLContext(
			true,
			faker.string.uuid(),
		);
		ctx = context;
		mocks = newMocks;

		mockFund = {
			createdAt: new Date(),
			creatorId: faker.string.uuid(),
			id: faker.string.uuid(),
			isArchived: false,
			isDefault: false,
			isTaxDeductible: true,
			name: faker.finance.accountName(),
			organizationId: faker.string.uuid(),
			referenceNumber: faker.string.alphanumeric(8),
			updatedAt: new Date(),
			updaterId: faker.string.uuid(),
		} as FundType;

		const mockSelectChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
		};
		mocks.drizzleClient.select = vi.fn().mockReturnValue(mockSelectChain);
	});

	describe("Complexity calculation", () => {
		it("should calculate complexity with 'first' multiplier", () => {
			expect(campaignsComplexity({ first: 10 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 10,
			});
		});

		it("should calculate complexity with 'last' multiplier", () => {
			expect(campaignsComplexity({ last: 5 })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 5,
			});
		});

		it("should default multiplier to 1 when no arguments are provided", () => {
			expect(campaignsComplexity({})).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});

		it("should default multiplier to 1 when first and last are 0 or null", () => {
			expect(campaignsComplexity({ first: 0, last: null })).toEqual({
				field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
				multiplier: 1,
			});
		});
	});

	describe("Schema registration", () => {
		it("should have campaigns field registered on Fund type", () => {
			expect(campaignsField).toBeDefined();
			expect(campaignsField?.description).toBe(
				"GraphQL connection to traverse through the campaigns for the fund.",
			);
			expect(campaignsField?.resolve).toBeDefined();
		});
	});

	describe("Forward pagination (first / after)", () => {
		it("should return campaigns successfully without cursor", async () => {
			const mockCampaigns = [
				{
					amountRaised: 1000,
					createdAt: new Date(),
					creatorId: faker.string.uuid(),
					currencyCode: "USD",
					endAt: new Date(),
					fundId: mockFund.id,
					goalAmount: 5000,
					id: faker.string.uuid(),
					name: "Campaign Alpha",
					startAt: new Date(),
					updatedAt: new Date(),
					updaterId: faker.string.uuid(),
				},
				{
					amountRaised: 2000,
					createdAt: new Date(),
					creatorId: faker.string.uuid(),
					currencyCode: "USD",
					endAt: new Date(),
					fundId: mockFund.id,
					goalAmount: 10000,
					id: faker.string.uuid(),
					name: "Campaign Beta",
					startAt: new Date(),
					updatedAt: new Date(),
					updaterId: faker.string.uuid(),
				},
			];

			mocks.drizzleClient.query.fundCampaignsTable.findMany.mockResolvedValueOnce(
				mockCampaigns,
			);

			const result = (await resolveCampaigns(
				mockFund,
				{ first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<FundCampaignType>;

			expect(result.edges).toHaveLength(2);
			expect(result.edges[0]?.node).toEqual(mockCampaigns[0]);
			expect(result.edges[1]?.node).toEqual(mockCampaigns[1]);
			expect(
				mocks.drizzleClient.query.fundCampaignsTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});

		it("should handle forward pagination with cursor (after)", async () => {
			const cursorName = "Campaign Alpha";
			const mockCursor = Buffer.from(
				JSON.stringify({
					name: cursorName,
				}),
			).toString("base64url");

			const mockCampaigns = [
				{
					amountRaised: 3000,
					createdAt: new Date(),
					creatorId: faker.string.uuid(),
					currencyCode: "USD",
					endAt: new Date(),
					fundId: mockFund.id,
					goalAmount: 15000,
					id: faker.string.uuid(),
					name: "Campaign Gamma",
					startAt: new Date(),
					updatedAt: new Date(),
					updaterId: faker.string.uuid(),
				},
			];

			mocks.drizzleClient.query.fundCampaignsTable.findMany.mockResolvedValueOnce(
				mockCampaigns,
			);

			const result = (await resolveCampaigns(
				mockFund,
				{ after: mockCursor, first: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<FundCampaignType>;

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.node.name).toBe("Campaign Gamma");
			expect(
				mocks.drizzleClient.query.fundCampaignsTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});
	});

	describe("Backward pagination (last / before)", () => {
		it("should return campaigns successfully without cursor (last only)", async () => {
			const mockCampaigns = [
				{
					amountRaised: 1000,
					createdAt: new Date(),
					creatorId: faker.string.uuid(),
					currencyCode: "USD",
					endAt: new Date(),
					fundId: mockFund.id,
					goalAmount: 5000,
					id: faker.string.uuid(),
					name: "Campaign Beta",
					startAt: new Date(),
					updatedAt: new Date(),
					updaterId: faker.string.uuid(),
				},
				{
					amountRaised: 2000,
					createdAt: new Date(),
					creatorId: faker.string.uuid(),
					currencyCode: "USD",
					endAt: new Date(),
					fundId: mockFund.id,
					goalAmount: 10000,
					id: faker.string.uuid(),
					name: "Campaign Alpha",
					startAt: new Date(),
					updatedAt: new Date(),
					updaterId: faker.string.uuid(),
				},
			];

			mocks.drizzleClient.query.fundCampaignsTable.findMany.mockResolvedValueOnce(
				mockCampaigns,
			);

			const result = (await resolveCampaigns(
				mockFund,
				{ last: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<FundCampaignType>;

			expect(result.edges).toHaveLength(2);
			expect(
				mocks.drizzleClient.query.fundCampaignsTable.findMany,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 6,
					orderBy: expect.any(Array),
					where: expect.any(Object),
				}),
			);
		});

		it("should handle backward pagination with cursor (before)", async () => {
			const cursorName = "Campaign Gamma";
			const mockCursor = Buffer.from(
				JSON.stringify({
					name: cursorName,
				}),
			).toString("base64url");

			const mockCampaigns = [
				{
					amountRaised: 1000,
					createdAt: new Date(),
					creatorId: faker.string.uuid(),
					currencyCode: "USD",
					endAt: new Date(),
					fundId: mockFund.id,
					goalAmount: 5000,
					id: faker.string.uuid(),
					name: "Campaign Beta",
					startAt: new Date(),
					updatedAt: new Date(),
					updaterId: faker.string.uuid(),
				},
				{
					amountRaised: 2000,
					createdAt: new Date(),
					creatorId: faker.string.uuid(),
					currencyCode: "USD",
					endAt: new Date(),
					fundId: mockFund.id,
					goalAmount: 10000,
					id: faker.string.uuid(),
					name: "Campaign Alpha",
					startAt: new Date(),
					updatedAt: new Date(),
					updaterId: faker.string.uuid(),
				},
			];

			mocks.drizzleClient.query.fundCampaignsTable.findMany.mockResolvedValueOnce(
				mockCampaigns,
			);

			const result = (await resolveCampaigns(
				mockFund,
				{ before: mockCursor, last: 5 },
				ctx,
				{} as GraphQLResolveInfo,
			)) as Connection<FundCampaignType>;

			expect(result.edges).toHaveLength(2);
			// Inversed pagination reverses the result array
			expect(result.edges[0]?.node.name).toBe("Campaign Alpha");
			expect(result.edges[1]?.node.name).toBe("Campaign Beta");
		});
	});

	describe("Validation and Error Handling", () => {
		it("should throw invalid_arguments error for invalid cursor on forward pagination", async () => {
			const invalidCursor = "not-valid-base64url";
			await expect(
				resolveCampaigns(
					mockFund,
					{ after: invalidCursor, first: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "invalid_arguments",
					}),
				}),
			);
		});

		it("should throw invalid_arguments error for invalid cursor on backward pagination", async () => {
			const invalidCursor = "not-valid-base64url";
			await expect(
				resolveCampaigns(
					mockFund,
					{ before: invalidCursor, last: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "invalid_arguments",
					}),
				}),
			);
		});

		it("should throw invalid_arguments error when both first and last are missing", async () => {
			await expect(
				resolveCampaigns(mockFund, {}, ctx, {} as GraphQLResolveInfo),
			).rejects.toThrow(TalawaGraphQLError);
		});

		it("should throw arguments_associated_resources_not_found when forward cursor returns 0 items", async () => {
			const mockCursor = Buffer.from(
				JSON.stringify({
					name: "Nonexistent Campaign",
				}),
			).toString("base64url");

			mocks.drizzleClient.query.fundCampaignsTable.findMany.mockResolvedValueOnce(
				[],
			);

			await expect(
				resolveCampaigns(
					mockFund,
					{ after: mockCursor, first: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "arguments_associated_resources_not_found",
					}),
				}),
			);
		});

		it("should throw arguments_associated_resources_not_found when backward cursor returns 0 items", async () => {
			const mockCursor = Buffer.from(
				JSON.stringify({
					name: "Nonexistent Campaign",
				}),
			).toString("base64url");

			mocks.drizzleClient.query.fundCampaignsTable.findMany.mockResolvedValueOnce(
				[],
			);

			await expect(
				resolveCampaigns(
					mockFund,
					{ before: mockCursor, last: 5 },
					ctx,
					{} as GraphQLResolveInfo,
				),
			).rejects.toThrowError(
				expect.objectContaining({
					extensions: expect.objectContaining({
						code: "arguments_associated_resources_not_found",
					}),
				}),
			);
		});
	});
});

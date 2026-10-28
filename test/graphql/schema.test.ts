import type { GraphQLSchema } from "graphql";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getCurrentSchema,
	initializeSchemaWithPlugins,
	schema,
} from "~/src/graphql/schema";
import { schemaManager } from "~/src/graphql/schemaManager";

describe("GraphQL Schema (src/graphql/schema.ts)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Executable Schema Definition", () => {
		it("should export a valid GraphQLSchema instance", () => {
			expect(schema).toBeDefined();
			expect(schema.constructor.name).toBe("GraphQLSchema");
		});

		it("should contain standard root operation types", () => {
			const queryType = schema.getQueryType();
			expect(queryType).toBeDefined();
			expect(queryType?.name).toBe("Query");

			const mutationType = schema.getMutationType();
			expect(mutationType).toBeDefined();
			expect(mutationType?.name).toBe("Mutation");

			const subscriptionType = schema.getSubscriptionType();
			expect(subscriptionType).toBeDefined();
			expect(subscriptionType?.name).toBe("Subscription");
		});

		it("should expose core queries on the Query type", () => {
			const queryType = schema.getQueryType();
			const fields = queryType?.getFields();
			expect(fields).toBeDefined();

			// Core query verification
			expect(fields?.currentUser).toBeDefined();
			expect(fields?.allUsers).toBeDefined();
			expect(fields?.organization).toBeDefined();
			expect(fields?.chat).toBeDefined();
			expect(fields?.signIn).toBeDefined();
		});

		it("should expose core mutations on the Mutation type", () => {
			const mutationType = schema.getMutationType();
			const fields = mutationType?.getFields();
			expect(fields).toBeDefined();

			// Core mutation verification
			expect(fields?.createOrganization).toBeDefined();
			expect(fields?.createChat).toBeDefined();
			expect(fields?.createPost).toBeDefined();
		});

		it("should define standard directives on the schema", () => {
			const directives = schema.getDirectives();
			expect(directives).toBeDefined();
			expect(directives.length).toBeGreaterThan(0);
			const directiveNames = directives.map((d) => d.name);
			expect(directiveNames).toContain("deprecated");
			expect(directiveNames).toContain("include");
			expect(directiveNames).toContain("skip");
		});
	});

	describe("initializeSchemaWithPlugins", () => {
		it("should delegate to schemaManager.buildInitialSchema and return the result", async () => {
			const mockPluginSchema = {
				constructor: { name: "GraphQLSchema" },
			} as unknown as GraphQLSchema;
			const buildSpy = vi
				.spyOn(schemaManager, "buildInitialSchema")
				.mockResolvedValue(mockPluginSchema);

			const result = await initializeSchemaWithPlugins();

			expect(buildSpy).toHaveBeenCalledTimes(1);
			expect(result).toBe(mockPluginSchema);
		});

		it("should propagate errors thrown by schemaManager.buildInitialSchema", async () => {
			const testError = new Error("Plugin initialization failed");
			vi.spyOn(schemaManager, "buildInitialSchema").mockRejectedValue(
				testError,
			);

			await expect(initializeSchemaWithPlugins()).rejects.toThrow(
				"Plugin initialization failed",
			);
		});
	});

	describe("getCurrentSchema", () => {
		it("should return the schema from schemaManager when available", () => {
			const mockCustomSchema = {
				constructor: { name: "GraphQLSchema" },
			} as unknown as GraphQLSchema;
			const getSpy = vi
				.spyOn(schemaManager, "getCurrentSchema")
				.mockReturnValue(mockCustomSchema);

			const current = getCurrentSchema();

			expect(getSpy).toHaveBeenCalledTimes(1);
			expect(current).toBe(mockCustomSchema);
		});

		it("should fallback to base schema when schemaManager returns null", () => {
			const getSpy = vi
				.spyOn(schemaManager, "getCurrentSchema")
				.mockReturnValue(null);

			const current = getCurrentSchema();

			expect(getSpy).toHaveBeenCalledTimes(1);
			expect(current).toBe(schema);
		});

		it("should fallback to base schema when schemaManager returns undefined", () => {
			const getSpy = vi
				.spyOn(schemaManager, "getCurrentSchema")
				.mockReturnValue(undefined as unknown as null);

			const current = getCurrentSchema();

			expect(getSpy).toHaveBeenCalledTimes(1);
			expect(current).toBe(schema);
		});
	});
});

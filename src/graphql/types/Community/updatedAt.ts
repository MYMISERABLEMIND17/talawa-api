import type { GraphQLContext } from "~/src/graphql/context";
import envConfig from "~/src/utilities/graphqLimits";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import type { Community as CommunityType } from "./Community";
import { Community } from "./Community";

/**
 * Resolver function to fetch the updatedAt timestamp of a community.
 *
 * @param parent - The Community parent object containing the updatedAt date.
 * @param _args - An empty arguments object (unused).
 * @param ctx - The GraphQL context containing client authentication and database queries.
 * @returns A promise resolving to the updatedAt Date.
 * @throws {TalawaGraphQLError} With code "unauthenticated" if the client is not authenticated or not found.
 * @throws {TalawaGraphQLError} With code "unauthorized_action" if the user is not an administrator.
 */
export const communityUpdatedAtResolver = async (
	parent: Pick<CommunityType, "updatedAt">,
	_args: Record<string, never>,
	ctx: GraphQLContext,
): Promise<Date | null> => {
	if (!ctx.currentClient.isAuthenticated) {
		throw new TalawaGraphQLError({
			extensions: {
				code: "unauthenticated",
			},
		});
	}

	const currentUserId = ctx.currentClient.user.id;

	const currentUser = await ctx.drizzleClient.query.usersTable.findFirst({
		columns: {
			role: true,
		},
		where: (fields, operators) => operators.eq(fields.id, currentUserId),
	});

	if (currentUser === undefined) {
		throw new TalawaGraphQLError({
			extensions: {
				code: "unauthenticated",
			},
		});
	}

	if (currentUser.role !== "administrator") {
		throw new TalawaGraphQLError({
			extensions: {
				code: "unauthorized_action",
			},
		});
	}

	return parent.updatedAt;
};

Community.implement({
	fields: (t) => ({
		updatedAt: t.field({
			description: "Date time at the time the community was last updated.",
			complexity: envConfig.API_GRAPHQL_SCALAR_RESOLVER_FIELD_COST,
			resolve: communityUpdatedAtResolver,
			type: "DateTime",
		}),
	}),
});

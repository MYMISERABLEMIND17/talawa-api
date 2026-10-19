import envConfig from "~/src/utilities/graphqLimits";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import type { GraphQLContext } from "../../context";
import { User } from "./User";

/**
 * Resolver for the `homePhoneNumber` field of the `User` type.
 *
 * This function retrieves the home phone number of a user. It enforces authorization rules:
 * - The client must be authenticated.
 * - The authenticated user must exist in the database.
 * - The user must be the same as the parent user or an administrator.
 *
 * @param parent - The parent `User` object.
 * @param _args - The arguments for the field (unused).
 * @param ctx - The GraphQL context containing the current client and Drizzle client.
 * @returns The home phone number string of the user, or null/undefined.
 * @throws {TalawaGraphQLError} if the user is unauthenticated or unauthorized.
 */
export const homePhoneNumberResolver = async (
	parent: User,
	_args: Record<string, never>,
	ctx: GraphQLContext,
) => {
	try {
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

		if (currentUser.role !== "administrator" && parent.id !== currentUserId) {
			throw new TalawaGraphQLError({
				extensions: {
					code: "unauthorized_action",
				},
			});
		}

		return parent.homePhoneNumber;
	} catch (error) {
		if (error instanceof TalawaGraphQLError) {
			throw error;
		}

		ctx.log.error(error);

		throw new TalawaGraphQLError({
			message: "Internal server error",
			extensions: {
				code: "unexpected",
			},
		});
	}
};

User.implement({
	fields: (t) => ({
		homePhoneNumber: t.field({
			description:
				"The phone number to use to communicate with the user at their home.",
			complexity: envConfig.API_GRAPHQL_SCALAR_RESOLVER_FIELD_COST,
			resolve: homePhoneNumberResolver,
			type: "PhoneNumber",
		}),
	}),
});

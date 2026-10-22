import type { GraphQLContext } from "~/src/graphql/context";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import type { ActionItem as ActionItemType } from "./ActionItem";
import { ActionItem } from "./ActionItem";

/**
 * Resolver for the updatedAt field on ActionItem.
 * Returns the updatedAt timestamp if the current user is authenticated
 * and is either a system administrator or has an organization membership with administrator privileges.
 *
 * @param parent - The ActionItem parent object
 * @param _args - GraphQL arguments (unused)
 * @param ctx - GraphQL context containing drizzle client, current client, and logger
 * @returns The updatedAt Date timestamp
 * @throws {TalawaGraphQLError} With code "unexpected" if parent.updatedAt is missing
 * @throws {TalawaGraphQLError} With code "unauthenticated" if user is not logged in or not found in database
 * @throws {TalawaGraphQLError} With code "unauthorized_action" if user lacks administrator permissions
 * @throws {TalawaGraphQLError} With code "unexpected" for internal server errors
 */
export const actionItemUpdatedAtResolver = async (
	parent: ActionItemType,
	_args: unknown,
	ctx: GraphQLContext,
): Promise<Date> => {
	try {
		if (!parent.updatedAt) {
			throw new TalawaGraphQLError({
				message: "Missing updatedAt value for the action item",
				extensions: {
					code: "unexpected",
				},
			});
		}
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
			with: {
				organizationMembershipsWhereMember: {
					columns: {
						role: true,
					},
					where: (fields, operators) =>
						operators.eq(fields.organizationId, parent.organizationId),
				},
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

		const currentUserOrganizationMembership =
			currentUser.organizationMembershipsWhereMember[0];

		if (
			currentUser.role !== "administrator" &&
			(currentUserOrganizationMembership === undefined ||
				currentUserOrganizationMembership.role !== "administrator")
		) {
			throw new TalawaGraphQLError({
				extensions: {
					code: "unauthorized_action",
				},
			});
		}

		return parent.updatedAt;
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

// Wire the resolver into ActionItem type.
ActionItem.implement({
	fields: (t) => ({
		updatedAt: t.field({
			description: "Date time at the time the action item was last updated.",
			resolve: actionItemUpdatedAtResolver,
			type: "DateTime",
		}),
	}),
});

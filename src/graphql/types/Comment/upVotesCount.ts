import { and, count, eq } from "drizzle-orm";
import { commentVotesTable } from "~/src/drizzle/tables/commentVotes";
import type { GraphQLContext } from "~/src/graphql/context";
import envConfig from "~/src/utilities/graphqLimits";
import { Comment, type Comment as CommentType } from "./Comment";

/**
 * Resolver function for the `Comment.upVotesCount` field.
 *
 * Counts the total number of up votes recorded for a specified comment in the database.
 *
 * @param parent - The parent `Comment` object whose up votes are counted.
 * @param _args - Empty arguments object for this field resolver.
 * @param ctx - The GraphQL execution context containing database connections.
 * @returns A promise resolving to the total count of up votes on the comment.
 */
export const upVotesCountResolver = async (
	parent: CommentType,
	_args: Record<string, never>,
	ctx: GraphQLContext,
): Promise<number> => {
	const [commentVote] = await ctx.drizzleClient
		.select({
			count: count(),
		})
		.from(commentVotesTable)
		.where(
			and(
				eq(commentVotesTable.commentId, parent.id),
				eq(commentVotesTable.type, "up_vote"),
			),
		);

	if (commentVote === undefined) {
		return 0;
	}

	return commentVote.count;
};

Comment.implement({
	fields: (t) => ({
		upVotesCount: t.field({
			description: "Total number of up votes on the comment.",
			resolve: upVotesCountResolver,
			complexity: envConfig.API_GRAPHQL_SCALAR_RESOLVER_FIELD_COST,
			type: "Int",
		}),
	}),
});

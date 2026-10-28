import { and, asc, desc, eq, exists, gt, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
	chatMessagesTable,
	chatMessagesTableInsertSchema,
} from "~/src/drizzle/tables/chatMessages";
import type { GraphQLContext } from "~/src/graphql/context";
import { ChatMessage } from "~/src/graphql/types/ChatMessage/ChatMessage";
import envConfig from "~/src/utilities/graphqLimits";
import {
	defaultGraphQLConnectionArgumentsSchema,
	transformDefaultGraphQLConnectionArguments,
	transformToDefaultGraphQLConnection,
} from "~/src/utilities/graphqlConnection";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import type { Chat as ChatType } from "./Chat";
import { Chat } from "./Chat";

const messagesArgumentsSchema = defaultGraphQLConnectionArgumentsSchema
	.transform(transformDefaultGraphQLConnectionArguments)
	.transform((arg, ctx) => {
		let cursor: z.infer<typeof cursorSchema> | undefined;

		try {
			if (arg.cursor !== undefined) {
				cursor = cursorSchema.parse(
					JSON.parse(Buffer.from(arg.cursor, "base64url").toString("utf-8")),
				);
			}
		} catch (_error) {
			ctx.addIssue({
				code: "custom",
				message: "Not a valid cursor.",
				path: [arg.isInversed ? "before" : "after"],
			});
		}

		return {
			cursor,
			isInversed: arg.isInversed,
			limit: arg.limit,
		};
	});

const cursorSchema = z.object({
	id: chatMessagesTableInsertSchema.shape.id.unwrap(),
});

export type MessagesArgs = z.input<
	typeof defaultGraphQLConnectionArgumentsSchema
>;

/**
 * Resolves a paginated list of chat messages for a specific chat using cursor-based pagination.
 *
 * Enforces authentication and authorization checks (system administrator, organization administrator, or chat member).
 * Supports forward and backward cursor pagination with ascending or descending ordering by message ID.
 *
 * @param parent - The parent chat whose messages are being requested.
 * @param args - Connection pagination arguments containing `first`, `last`, `after`, or `before`.
 * @param ctx - The GraphQL execution context.
 * @returns A default GraphQL connection containing nodes, edges, and pageInfo.
 */
export const resolveChatMessagesPaginated = async (
	parent: ChatType,
	args: MessagesArgs,
	ctx: GraphQLContext,
) => {
	if (!ctx.currentClient.isAuthenticated) {
		throw new TalawaGraphQLError({
			extensions: {
				code: "unauthenticated",
			},
		});
	}

	const {
		data: parsedArgs,
		error,
		success,
	} = messagesArgumentsSchema.safeParse(args);

	if (!success) {
		throw new TalawaGraphQLError({
			extensions: {
				code: "invalid_arguments",
				issues: error.issues.map((issue) => ({
					argumentPath: issue.path,
					message: issue.message,
				})),
			},
		});
	}

	const currentUserId = ctx.currentClient.user.id;

	const currentUser = await ctx.drizzleClient.query.usersTable.findFirst({
		with: {
			chatMembershipsWhereMember: {
				columns: {
					role: true,
				},
				where: (fields, operators) => operators.eq(fields.chatId, parent.id),
			},
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
	const currentUserChatMembership = currentUser.chatMembershipsWhereMember[0];

	if (
		currentUser.role !== "administrator" &&
		(currentUserOrganizationMembership === undefined ||
			(currentUserOrganizationMembership.role !== "administrator" &&
				currentUserChatMembership === undefined))
	) {
		throw new TalawaGraphQLError({
			extensions: {
				code: "unauthorized_action",
			},
		});
	}

	const { cursor, isInversed, limit } = parsedArgs;

	const orderBy = isInversed
		? [desc(chatMessagesTable.id)]
		: [asc(chatMessagesTable.id)];

	let where: SQL | undefined;

	if (isInversed) {
		if (cursor !== undefined) {
			where = and(
				exists(
					ctx.drizzleClient
						.select()
						.from(chatMessagesTable)
						.where(
							and(
								eq(chatMessagesTable.chatId, parent.id),
								eq(chatMessagesTable.id, cursor.id),
							),
						),
				),
				eq(chatMessagesTable.chatId, parent.id),
				lt(chatMessagesTable.id, cursor.id),
			);
		} else {
			where = eq(chatMessagesTable.chatId, parent.id);
		}
	} else {
		if (cursor !== undefined) {
			where = and(
				exists(
					ctx.drizzleClient
						.select()
						.from(chatMessagesTable)
						.where(
							and(
								eq(chatMessagesTable.chatId, parent.id),
								eq(chatMessagesTable.id, cursor.id),
							),
						),
				),
				eq(chatMessagesTable.chatId, parent.id),
				gt(chatMessagesTable.id, cursor.id),
			);
		} else {
			where = eq(chatMessagesTable.chatId, parent.id);
		}
	}

	const chatMessages = await ctx.drizzleClient.query.chatMessagesTable.findMany(
		{
			limit,
			orderBy,
			where,
		},
	);

	if (cursor !== undefined && chatMessages.length === 0) {
		throw new TalawaGraphQLError({
			extensions: {
				code: "arguments_associated_resources_not_found",
				issues: [
					{
						argumentPath: [isInversed ? "before" : "after"],
					},
				],
			},
		});
	}

	return transformToDefaultGraphQLConnection({
		createCursor: (message) => ({
			id: message.id,
		}),
		createNode: (message) => message,
		parsedArgs,
		rawNodes: chatMessages,
	});
};

/**
 * Calculates query complexity for the chat messages connection field.
 *
 * @param args - Connection arguments containing optional `first` or `last` limits.
 * @returns Complexity object with field cost and calculated multiplier.
 */
export const messagesComplexity = (args: {
	first?: number | null;
	last?: number | null;
}) => {
	return {
		field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
		multiplier: args.first || args.last || 1,
	};
};

Chat.implement({
	fields: (t) => ({
		messages: t.connection(
			{
				description:
					"GraphQL connection to traverse through the messages created within the chat.",
				complexity: messagesComplexity,
				resolve: resolveChatMessagesPaginated,
				type: ChatMessage,
			},
			{
				edgesField: {
					complexity: {
						field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
						multiplier: 1,
					},
				},
				description: "",
			},
			{
				nodeField: {
					complexity: {
						field: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
						multiplier: 1,
					},
				},
				description: "",
			},
		),
	}),
});

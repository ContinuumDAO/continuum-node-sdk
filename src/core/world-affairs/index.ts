export {
	WORLD_AFFAIRS_SOURCES,
	WORLD_AFFAIRS_SOURCE_IDS,
	isWorldAffairsSourceId,
	resolveWorldAffairsSources,
	worldAffairsSourceById,
	type WorldAffairsSource,
	type WorldAffairsSourceId,
} from './sources.js';
export {
	GetWorldAffairsLatestInputSchema,
	GetWorldAffairsLatestOutputSchema,
	ListWorldAffairsSourcesInputSchema,
	ListWorldAffairsSourcesOutputSchema,
	SearchWorldAffairsLatestInputSchema,
	WorldAffairsItemSchema,
	type GetWorldAffairsLatestInput,
	type GetWorldAffairsLatestOutput,
	type ListWorldAffairsSourcesOutput,
	type SearchWorldAffairsLatestInput,
	type WorldAffairsItem,
} from './schemas.js';
export {
	getWorldAffairsLatest,
	listWorldAffairsSources,
	searchWorldAffairsLatest,
	type WorldAffairsFetchDeps,
} from './fetch.js';

export type SdkResult<T> =
	| {ok: true; data: T}
	| {ok: false; reason: string};

export type SdkPreparedResult<T> =
	| {ok: true; prepared: T}
	| {ok: false; reason: string};

export type SdkEmptyResult = {ok: true} | {ok: false; reason: string};

// #region Internal Types

const enum _ {
	callback = "a",
	dirty = "b",
	eq = "c",
	epoch = "d",
	error = "e",
	notify = "f",
	sinks = "g",
	sources = "h",
	sourceVersions = "i",
	value = "j",
	version = "k",
	watched = "l",
	unwatched = "m",
	wrapper = "n",
	nextSource = "o",
}

interface Node {
	[_.sinks]?: AnyConsumerNode[];
	[_.unwatched]?: () => void;
	[_.watched]?: () => void;
	[_.wrapper]: any;
}

interface SignalNode<TValue = unknown> extends Node {
	[_.eq]?: (this: any, a: any, b: any) => boolean;
	[_.value]: TValue;
	[_.version]: number;
}

interface ConsumerNode extends Node {
	[_.dirty]: boolean;
	[_.sources]: AnySignalNode[];
	[_.nextSource]?: number;
}

interface ComputedNode<TValue = unknown> extends SignalNode<any>, ConsumerNode {
	[_.callback]: (this: any) => any;
	[_.epoch]?: number;
	[_.error]?: unknown;
	[_.sourceVersions]: number[];
	[_.value]: any;
	[_.wrapper]: Computed<TValue>;
}

interface WatcherNode extends ConsumerNode {
	[_.notify]: (this: Watcher) => void;
	[_.wrapper]: Watcher;
}

type AnySignalNode<TValue = any> = SignalNode<TValue> | ComputedNode<TValue>;
type AnyConsumerNode = ComputedNode | WatcherNode;
type AnySink = Computed<any> | Watcher;

interface Options<T> {
	equals?: (this: T, a: any, b: any) => boolean;
	[watched]?: (this: T) => void;
	[unwatched]?: (this: T) => void;
}

// #region Internal State

let computing: ComputedNode | null = null;
let epoch = 0;
let notifying = false;
let notificationErrors: unknown[] | undefined;

// Private function identities double as allocation-free sentinels: err = unset, signalNode = computing, runHook = errored.
const NODE = Symbol();
const watched = Symbol("watched");
const unwatched = Symbol("unwatched");

// #region Internal Utilities

const err = (message: string): never => {
	throw new TypeError("Expected " + message);
};

const check = () => {
	if (notifying) err("unfrozen");
};

const runHook = (callback: (() => void) | undefined, node: AnySignalNode) => {
	if (callback) {
		notifying = true;
		try {
			callback.call(node[_.wrapper]);
		} finally {
			notifying = false;
		}
	}
};

const addSink = (source: AnySignalNode, sink: AnyConsumerNode) => {
	if ((source[_.sinks] ||= []).push(sink) === 1) {
		const computed = source as ComputedNode;
		if (computed[_.callback]) {
			for (const dependency of computed[_.sources]) addSink(dependency, computed);
		}
		runHook(source[_.watched], source);
	}
};

const removeSink = (source: AnySignalNode, sink: AnyConsumerNode) => {
	const sinks = source[_.sinks]!;
	const sinkIndex = sinks.indexOf(sink);
	sinks.splice(sinkIndex, 1);

	if (!sinks.length) {
		const computed = source as ComputedNode;
		if (computed[_.callback]) {
			for (const dependency of computed[_.sources]) removeSink(dependency, computed);
		}
		runHook(source[_.unwatched], source);
	}
};

const markDirty = (node: AnyConsumerNode) => {
	if (node[_.dirty]) return;
	node[_.dirty] = true;

	const watcher = node as WatcherNode;
	if (watcher[_.notify]) {
		try {
			watcher[_.notify].call(watcher[_.wrapper]);
		} catch (error) {
			(notificationErrors ||= []).push(error);
		}
	} else {
		for (const sink of node[_.sinks] || []) markDirty(sink);
	}
};

const track = (source: AnySignalNode) => {
	if (!computing) return;
	const sourceIndex = computing[_.nextSource]!++;
	const previousSource = computing[_.sources][sourceIndex];

	if (previousSource !== source) {
		if (previousSource && computing[_.sinks]?.length) {
			removeSink(previousSource, computing);
		}
		computing[_.sources][sourceIndex] = source;
		if (computing[_.sinks]?.length) addSink(source, computing);
	}
	computing[_.sourceVersions][sourceIndex] = source[_.version];
};

const finishTracking = (node: ComputedNode) => {
	while (node[_.sources].length > node[_.nextSource]!) {
		const source = node[_.sources].at(-1)!;
		if (node[_.sinks]?.length) removeSink(source, node);
		node[_.sources].pop();
		node[_.sourceVersions].pop();
	}
};

const sourcesChanged = (node: ComputedNode) => {
	for (let index = 0; index < node[_.sources].length; index++) {
		const source = node[_.sources][index];
		if (source[_.version] !== node[_.sourceVersions][index]) return true;
		const computed = source as ComputedNode;
		if (computed[_.callback]) updateComputed(computed);
		if (source[_.version] !== node[_.sourceVersions][index]) return true;
	}
	return false;
};

const recompute = <T>(node: ComputedNode<T>) => {
	const previousValue = node[_.value];
	node[_.value] = signalNode;
	node[_.nextSource] = 0;
	const previousComputing = computing;
	computing = node;
	let value: T | typeof runHook = runHook;
	let error: unknown = err;
	let equal = false;

	try {
		value = node[_.callback].call(node[_.wrapper]);
		equal =
			previousValue !== err &&
			previousValue !== runHook &&
			(node[_.eq] ? node[_.eq].call(node[_.wrapper], previousValue, value) : Object.is(previousValue, value));
	} catch (caught) {
		error = caught;
	} finally {
		computing = previousComputing;
		finishTracking(node);
	}

	node[_.dirty] = false;
	node[_.epoch] = epoch;
	if (error !== err) {
		node[_.error] = error;
		node[_.value] = runHook;
		node[_.version]++;
	} else {
		node[_.value] = equal ? previousValue : value;
		if (!equal) node[_.version]++;
	}
};

const updateComputed = (node: ComputedNode) => {
	if (node[_.value] === signalNode) err("no cycle");
	if (!node[_.dirty] && node[_.epoch] === epoch) return;
	if (node[_.value] !== err && !sourcesChanged(node)) {
		node[_.dirty] = false;
		node[_.epoch] = epoch;
		return;
	}
	recompute(node);
};

const signalNode = (signal: unknown): AnySignalNode => {
	if (State.is(signal) || Computed.is(signal)) return signal[NODE];
	return err("signal");
};

const consumerNode = (sink: unknown): AnyConsumerNode => {
	if (Computed.is(sink) || Watcher.is(sink)) return sink[NODE];
	return err("signal");
};

// #region Signal Classes

class State<T> {
	#brand() {}
	readonly [NODE]: SignalNode<T>;

	static is(value: unknown): value is State<unknown> {
		return typeof value === "object" && value !== null && #brand in value;
	}

	constructor(value: T, options?: Options<State<T>>) {
		const node = {
			[_.value]: value,
			[_.version]: 0,
			[_.wrapper]: this,
		} as SignalNode<T>;
		if (options) {
			node[_.eq] = options.equals;
			node[_.unwatched] = options[unwatched];
			node[_.watched] = options[watched];
		}
		this[NODE] = node;
	}

	get() {
		if (!State.is(this)) return err("receiver");
		check();
		const node = this[NODE];
		track(node);
		return node[_.value];
	}

	set(value: T) {
		if (!State.is(this)) return err("receiver");
		check();
		const node = this[NODE];
		if (!(node[_.eq] ? node[_.eq].call(this, node[_.value], value) : Object.is(node[_.value], value))) {
			node[_.value] = value;
			node[_.version]++;
			epoch++;
			if (node[_.sinks]?.length) {
				notifying = true;
				let errors: unknown[] | undefined;
				try {
					for (const sink of node[_.sinks]) markDirty(sink);
				} finally {
					notifying = false;
					errors = notificationErrors;
					notificationErrors = undefined;
				}
				if (errors?.length === 1) throw errors[0];
				if (errors && errors.length > 1) throw new AggregateError(errors);
			}
		}
	}
}

class Computed<T> {
	#brand() {}
	readonly [NODE]: ComputedNode<T>;

	static is(value: unknown): value is Computed<unknown> {
		return typeof value === "object" && value !== null && #brand in value;
	}

	constructor(callback: (this: Computed<T>) => T, options?: Options<Computed<T>>) {
		const node = {
			[_.callback]: callback,
			[_.dirty]: true,
			[_.epoch]: -1,
			[_.nextSource]: 0,
			[_.sources]: [],
			[_.sourceVersions]: [],
			[_.value]: err,
			[_.version]: 0,
			[_.wrapper]: this,
		} as ComputedNode<T>;
		if (options) {
			node[_.eq] = options.equals;
			node[_.unwatched] = options[unwatched];
			node[_.watched] = options[watched];
		}
		this[NODE] = node;
	}

	get(): T {
		if (!Computed.is(this)) return err("receiver");
		check();
		const node = this[NODE];
		updateComputed(node);
		track(node);
		if (node[_.value] === runHook) throw node[_.error];
		return node[_.value] as T;
	}
}

class Watcher {
	#brand() {}
	readonly [NODE]: WatcherNode;

	static is(value: unknown): value is Watcher {
		return typeof value === "object" && value !== null && #brand in value;
	}

	constructor(notify: (this: Watcher) => void) {
		this[NODE] = {
			[_.dirty]: false,
			[_.notify]: notify,
			[_.sources]: [],
			[_.wrapper]: this,
		};
	}

	watch(...signals: AnySignal[]) {
		if (!Watcher.is(this)) return err("receiver");
		check();
		for (const signal of signals) signalNode(signal);
		const node = this[NODE];
		node[_.dirty] = false;
		for (const signal of signals) {
			const source = signalNode(signal);
			if (!node[_.sources].includes(source)) {
				node[_.sources].push(source);
				addSink(source, node);
			}
		}
	}

	unwatch(...signals: AnySignal[]) {
		if (!Watcher.is(this)) return err("receiver");
		check();
		for (const signal of signals) signalNode(signal);
		const node = this[NODE];
		for (const signal of signals) {
			const source = signalNode(signal);
			const sourceIndex = node[_.sources].indexOf(source);
			if (sourceIndex >= 0) {
				removeSink(source, node);
				node[_.sources].splice(sourceIndex, 1);
			}
		}
	}

	getPending() {
		if (!Watcher.is(this)) return err("receiver");
		const pending: Computed<any>[] = [];
		for (const source of this[NODE][_.sources]) {
			if ((source as ComputedNode)[_.callback] && (source as ComputedNode)[_.dirty]) {
				pending.push(source[_.wrapper]);
			}
		}
		return pending;
	}
}

// #region Signal Exports

export type AnySignal<T = any> = State<T> | Computed<T>;

export const Signal = {
	State,
	Computed,
	isState: State.is,
	isComputed: Computed.is,
	isWatcher: Watcher.is,
	subtle: {
		currentComputed() {
			return computing?.[_.wrapper] as Computed<any> | undefined;
		},

		hasSinks(signal: AnySignal) {
			return !!signalNode(signal)[_.sinks]?.length;
		},
		hasSources(signal: AnySink) {
			return !!consumerNode(signal)[_.sources].length;
		},
		introspectSinks(signal: AnySignal) {
			return (signalNode(signal)[_.sinks]?.map((node) => node[_.wrapper]) || []) as AnySink[];
		},
		introspectSources(signal: AnySink) {
			return consumerNode(signal)[_.sources].map((node) => node[_.wrapper]) as AnySignal[];
		},
		untrack<T>(callback: () => T): T {
			const prev = computing;

			computing = null;

			try {
				return callback();
			} finally {
				computing = prev;
			}
		},
		watched,
		unwatched,
		Watcher,
	},
};

import { signalProxy } from "./signalProxy.js";

/** A shallow signal-backed plain record constructor. */
export const SignalObject = Object.assign(
	function SignalObject(value: object = {}): object {
		return signalProxy({ ...value });
	},
	{
		fromEntries: <Value = unknown>(entries: Iterable<readonly [PropertyKey, Value]>): { [key: string]: Value } =>
			signalProxy(Object.fromEntries(entries)) as { [key: string]: Value },
	},
) as unknown as {
	new <Value extends Record<PropertyKey, unknown> = Record<PropertyKey, unknown>>(value?: Value): Value;
	readonly prototype: SignalObject;
	fromEntries: <Value = unknown>(entries: Iterable<readonly [PropertyKey, Value]>) => { [key: string]: Value };
};

export type SignalObject<Value extends Record<PropertyKey, unknown> = Record<PropertyKey, unknown>> = Value;

declare type I32 = number;
declare type I64 = number | bigint;
declare type F32 = number;
declare type F64 = number;
declare type PTR = I64;

declare const Host: {
  getFunctions(): Record<string, (ptr: I64) => I64>;
  inputString(): string;
  inputBytes(): ArrayBufferLike;
  outputString(output: string): boolean;
  outputBytes(output: ArrayBufferLike): boolean;
};

declare const Memory: {
  fromString(str: string): MemoryHandle;
  fromBuffer(bytes: ArrayBufferLike): MemoryHandle;
  fromJsonObject(obj: unknown): MemoryHandle;
  find(offset: PTR): MemoryHandle;
};

interface MemoryHandle {
  offset: PTR;
  readString(): string;
  readBytes(): ArrayBuffer;
  readJsonObject<T = unknown>(): T;
  free(): void;
}

declare module "main" {
  export function get_metadata(): I32;
  export function get_filters(): I32;
}

declare module "extism:host" {
  interface makinuki {
    makinuki_fetch(ptr: I64): I64;
    makinuki_storage_get(ptr: I64): I64;
    makinuki_storage_set(ptr: I64): I64;
    makinuki_log(ptr: I64): I64;
  }
}
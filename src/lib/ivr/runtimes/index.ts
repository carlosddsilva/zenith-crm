import {
  IvrRuntimeError,
} from "../runtime";

import type {
  IvrRuntime,
} from "../runtime";

import type {
  IvrProviderId,
} from "../types";

import {
  waCallsIvrRuntime,
} from "./wacalls";

export function getIvrRuntime(
  provider:
    IvrProviderId,
): IvrRuntime {
  if (
    provider ===
    "wacalls"
  ) {
    return waCallsIvrRuntime;
  }

  throw new IvrRuntimeError(
    "ivr_runtime_not_implemented",
    `Runtime IVR ainda nao implementado para ${provider}.`,
    501,
  );
}

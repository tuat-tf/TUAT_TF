"use client";

import { clear, createStore } from "idb-keyval";

const store = createStore("tuat-tf-app", "query-cache");

export function clearPersistedQueries() {
  return clear(store);
}

/** Tabular export data shared by the current competition CSV exporters. */
export type TableCell = string | number | null;
export type TableSheet = { name: string; rows: TableCell[][]; widths?: number[] };

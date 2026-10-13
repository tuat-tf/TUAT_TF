import type { AppRole, Block, EditableMenuBlock } from "@/types";
import { normalizeBlock } from "./constants";
import { permissionsOf } from "./permissions";

export function editableMenuBlocks(roles: AppRole[] | null | undefined): EditableMenuBlock[] {
  if (!permissionsOf(roles).createMenu) return [];
  return [...new Set((roles ?? []).flatMap(role => role.permissions_suppressed ? [] :
    (role.editable_menu_blocks ?? []).filter(block => block === "short" || block === "middle_long")))];
}

export function menuAccess({ userId, authorId, targetBlock, canCreate, canManageAll, editableBlocks = [] }: {
  userId?: string; authorId?: string; targetBlock: Block | null;
  canCreate: boolean; canManageAll: boolean; editableBlocks?: Block[];
}) {
  const canDelete = canManageAll || (!!userId && authorId === userId && canCreate);
  const canEdit = canDelete || (canCreate && targetBlock !== null && editableBlocks.includes(normalizeBlock(targetBlock)));
  return { canEdit, canDelete };
}

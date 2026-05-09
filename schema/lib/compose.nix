# Composition helper: processes operations to add implicit CRUD operation
# contracts and auto-generate event names.
{ lib }:

let
  crudActions = [ "read" "create" "update" "delete" ];
  defaultOperation = {
    guard = null;
    relationships = [];
    public = false;
    scope = null;
    set = {};
    cascade = [];
    effects = [];
  };
in
{
  crudActions = crudActions;

  # Auto-generate emit event names for operations
  # Only emits events if there are other effects (notify, call) or explicit emit
  processOperations = tables: ops:
    let
      withCrud = lib.mapAttrs (table: _:
        (lib.genAttrs crudActions (_: defaultOperation)) // (ops.${table} or {})
      ) tables;
    in
    lib.mapAttrs (table: tableOps:
    lib.mapAttrs (opName: op:
      let
        eventName = "${table}.${opName}";
        hasExplicitEmit = lib.any (e: (e.emit or null) != null && e.emit != "") op.effects;
        hasOtherEffects = lib.any (e: (e.notify or null) != null || (e.call or null) != null) op.effects;
      in
      op // {
        effects =
          if op.effects == [] then
            # No effects at all - don't emit anything
            []
          else if hasExplicitEmit then
            # Already has explicit emit, keep as-is
            op.effects
          else if hasOtherEffects then
            # Has notify/call effects, prepend auto-generated emit
            [{ emit = eventName; }] ++ op.effects
          else
            # Only empty effects, don't emit
            [];
      }
    ) tableOps
  ) withCrud;
}

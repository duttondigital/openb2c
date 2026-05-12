# Composition helper: processes operations to add implicit CRUD operation
# contracts and auto-generate event names.
{ lib }:

let
  crudActions = [ "read" "create" "update" "delete" ];
  defaultOperation = {
    guard = null;
    relationships = null;
    public = false;
    scope = null;
    policy = {};
    workflow = {};
    audit = {};
    set = {};
    cascade = [];
    effects = [];
  };
in
{
  crudActions = crudActions;

  # Auto-generate emit event names for operations
  # Only emits events if there are other effects (notify, call) or explicit emit
  processOperations = tables: explicitRelationships: ops:
    let
      isUserReference = ref: ref == "user(id)" || ref == "user.id";

      fieldRef = table: field:
        let col = tables.${table}.${field};
        in {
          inherit table field;
          references = col.references or null;
        };

      defaultRelationshipNames = table: action:
        if table == "user" && (action == "read" || action == "update") && (tables.${table}.id or null) != null then
          [ "self" ]
        else if (tables.${table}.user_id or null) != null && isUserReference (tables.${table}.user_id.references or null) then
          [ "user" ]
        else
          [];

      conventionFieldName = table: name:
        if table == "user" && (name == "self" || name == "user") then "id"
        else if name == "user" then "user_id"
        else "${name}_id";

      resolveRelationship = table: spec:
        if builtins.isAttrs spec then
          spec
        else
          let
            explicit = lib.attrByPath [ table spec ] null explicitRelationships;
            field = conventionFieldName table spec;
            col = tables.${table}.${field} or null;
            validConvention =
              col != null &&
              (
                (table == "user" && field == "id") ||
                isUserReference (col.references or null)
              );
          in
            if explicit != null then
              explicit
            else if validConvention then
              { field = fieldRef table field; }
            else
              throw "Cannot resolve relationship '${spec}' for ${table}; expected ${table}.${field} to reference user(id), or define relationships.${table}.${spec}.field explicitly.";

      withCrud = lib.mapAttrs (table: _:
        (lib.genAttrs crudActions (_: defaultOperation)) // (ops.${table} or {})
      ) tables;

      relationshipSpecs = table: tableOps: opName: op:
        if op.public then
          []
        else if op.relationships != null then
          op.relationships
        else if lib.elem opName crudActions then
          defaultRelationshipNames table opName
        else if (tableOps.update.relationships or null) != null then
          tableOps.update.relationships
        else
          defaultRelationshipNames table "update";
    in
    lib.mapAttrs (table: tableOps:
    lib.mapAttrs (opName: op:
      let
        eventName = "${table}.${opName}";
        hasExplicitEmit = lib.any (e: (e.emit or null) != null && e.emit != "") op.effects;
        hasOtherEffects = lib.any (e: (e.notify or null) != null || (e.call or null) != null) op.effects;
        resolvedRelationships = map (resolveRelationship table) (relationshipSpecs table tableOps opName op);
      in
      op // {
        relationships = resolvedRelationships;
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

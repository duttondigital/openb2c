# Base module: defines option types for tables, relationships, operations, effects
{ lib, config, ... }:

let
  # Organization metadata describes the top-level entity the generated app belongs to.
  organizationType = lib.types.submodule {
    options = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "OpenB2C";
        description = "Human-readable organization or product name.";
      };
      description = lib.mkOption {
        type = lib.types.str;
        default = "Generated OpenB2C organization";
        description = "Organization or product description.";
      };
    };
  };

  # Column definition
  columnType = lib.types.submodule {
    options = {
      type = lib.mkOption { type = lib.types.str; };
      pk = lib.mkOption { type = lib.types.bool; default = false; };
      auto = lib.mkOption { type = lib.types.bool; default = false; };
      required = lib.mkOption { type = lib.types.bool; default = false; };
      unique = lib.mkOption { type = lib.types.bool; default = false; };
      default = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      references = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
    };
  };

  # Structured reference to a table field. These are generated under
  # `config.refs.<table>.<field>` so policy can avoid stringly references.
  fieldRefType = lib.types.submodule {
    options = {
      table = lib.mkOption { type = lib.types.str; };
      field = lib.mkOption { type = lib.types.str; };
      references = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
    };
  };

  # Record-level relationship between auth.userId and a resource field.
  relationshipType = lib.types.submodule {
    options = {
      field = lib.mkOption {
        type = fieldRefType;
        description = "Structured field reference implementing this relationship.";
      };
    };
  };

  # Effect types
  effectType = lib.types.submodule {
    options = {
      emit = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      notify = lib.mkOption {
        type = lib.types.nullOr (lib.types.submodule {
          options = {
            channel = lib.mkOption { type = lib.types.str; };
            template = lib.mkOption { type = lib.types.str; };
            to = lib.mkOption { type = lib.types.str; default = "customer"; };
          };
        });
        default = null;
      };
      call = lib.mkOption {
        type = lib.types.nullOr (lib.types.submodule {
          options = {
            service = lib.mkOption { type = lib.types.str; };
            action = lib.mkOption { type = lib.types.str; };
          };
        });
        default = null;
      };
    };
  };

  # Cascade update
  cascadeType = lib.types.submodule {
    options = {
      entity = lib.mkOption { type = lib.types.str; };
      via = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      set = lib.mkOption { type = lib.types.attrsOf lib.types.str; default = {}; };
    };
  };

  # Operation definition
  operationType = lib.types.submodule {
    options = {
      guard = lib.mkOption {
        type = lib.types.nullOr lib.types.attrs;  # Expression AST
        default = null;
        description = "Precondition expression (built with lib/expr.nix)";
      };
      relationships = lib.mkOption {
        type = lib.types.listOf relationshipType;
        default = [];
        description = "Record relationships that permit this operation for auth.userId.";
      };
      public = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Allow this operation without an authenticated scope.";
      };
      scope = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Optional permission scope override. Defaults to <entity>.<operation>.";
      };
      set = lib.mkOption {
        type = lib.types.attrsOf lib.types.str;
        default = {};
        description = "Fields to update";
      };
      cascade = lib.mkOption {
        type = lib.types.listOf cascadeType;
        default = [];
        description = "Cascading updates to related entities";
      };
      effects = lib.mkOption {
        type = lib.types.listOf effectType;
        default = [];
        description = "Side effects to trigger";
      };
    };
  };

in {
  options = {
    organization = lib.mkOption {
      type = organizationType;
      default = {};
      description = "Top-level organization or product metadata.";
    };

    tables = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf columnType);
      default = {};
      description = "Database table definitions";
    };

    refs = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf fieldRefType);
      default = lib.mapAttrs (table: cols:
        lib.mapAttrs (field: col: {
          inherit table field;
          references = col.references;
        }) cols
      ) config.tables;
      description = "Structured references for table fields.";
    };

    relationships = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf relationshipType);
      default = {};
      description = "Record relationship definitions per entity.";
    };

    operations = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf operationType);
      default = {};
      description = "Operations per entity (e.g., operations.ticket.confirm)";
    };
  };
}

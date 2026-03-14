# Base module: defines option types for tables, operations, effects
{ lib, ... }:

let
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
    tables = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf columnType);
      default = {};
      description = "Database table definitions";
    };

    operations = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf operationType);
      default = {};
      description = "Operations per entity (e.g., operations.ticket.confirm)";
    };
  };
}

# Base module: defines option types for tables, operations, effects
{ lib, ... }:

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

  # Authorization policy. Rules are ORed within an action; populated fields in a
  # rule are ANDed. `owner` is evaluated against the entity owner fields and the
  # authenticated `userId`, so it is policy metadata rather than an auth principal.
  authorizationRuleType = lib.types.submodule {
    options = {
      principals = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Platform principals accepted by this rule.";
      };
      roles = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Domain roles accepted by this rule.";
      };
      scopes = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Permission scopes accepted by this rule.";
      };
      owner = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Require the record to be owned by auth.userId.";
      };
      ownerFields = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Rule-specific owner fields. Defaults to the entity ownerFields.";
      };
    };
  };

  actionAuthorizationType = lib.types.submodule {
    options = {
      allow = lib.mkOption {
        type = lib.types.listOf authorizationRuleType;
        default = [];
        description = "Allow rules for this action.";
      };
    };
  };

  entityAuthorizationType = lib.types.submodule {
    options = {
      ownerFields = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Fields that identify the owning user for this entity.";
      };
      read = lib.mkOption {
        type = actionAuthorizationType;
        default = {};
        description = "Read authorization policy.";
      };
      create = lib.mkOption {
        type = actionAuthorizationType;
        default = {};
        description = "Create authorization policy.";
      };
      update = lib.mkOption {
        type = actionAuthorizationType;
        default = {};
        description = "Update authorization policy.";
      };
      delete = lib.mkOption {
        type = actionAuthorizationType;
        default = {};
        description = "Delete authorization policy.";
      };
      operations = lib.mkOption {
        type = lib.types.attrsOf actionAuthorizationType;
        default = {};
        description = "Operation-specific authorization policies.";
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

    operations = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf operationType);
      default = {};
      description = "Operations per entity (e.g., operations.ticket.confirm)";
    };

    authorization = lib.mkOption {
      type = lib.types.attrsOf entityAuthorizationType;
      default = {};
      description = "Authorization policy per entity and operation.";
    };
  };
}

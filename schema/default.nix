let
  lib = import <nixpkgs/lib>;

  columnType = lib.types.submodule {
    options = {
      type = lib.mkOption {type = lib.types.str;};
      pk = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      auto = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      required = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      unique = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      default = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
      };
      references = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
      };
    };
  };

  modules = lib.evalModules {
    modules =
      [
        {
          options.tables = lib.mkOption {
            type = lib.types.attrsOf (lib.types.attrsOf columnType);
            default = {};
          };
        }
      ]
      ++ (
        let
          dir = ./modules;
        in
          map (f: dir + "/${f}") (builtins.attrNames (builtins.readDir dir))
      );
  };
in
  modules.config.tables

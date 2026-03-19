{
  description = "Duchy Opera";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    supportedSystems = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ];

    forEachSupportedSystem = f:
      nixpkgs.lib.genAttrs supportedSystems (
        system:
          f {
            pkgs = import nixpkgs {
              inherit system;
            };
          }
      );
  in {
    devShells = forEachSupportedSystem (
      {pkgs}:
        with pkgs; let
          compose = writeShellScriptBin "compose" ''
            set -euo pipefail

            if [ $# -eq 0 ]; then
              echo "Usage: compose <composition.nix>"
              echo "Example: compose examples/duchyopera/composition.nix"
              echo "         compose composition.nix (from within example dir)"
              exit 1
            fi

            # Find project root (where schema/ directory lives)
            current_dir="$PWD"
            while [[ "$current_dir" != "/" ]]; do
              if [[ -d "$current_dir/schema" ]]; then
                project_root="$current_dir"
                break
              fi
              current_dir="$(dirname "$current_dir")"
            done

            if [[ -z "''${project_root:-}" ]]; then
              echo "Error: Could not find project root (no schema/ directory found)"
              exit 1
            fi

            # Convert composition path to absolute if relative
            composition_path="$1"
            if [[ ! "$composition_path" = /* ]]; then
              composition_path="$PWD/$composition_path"
            fi

            # Run from project root
            cd "$project_root"
            ${nix}/bin/nix eval --json -f "$composition_path" | ${bun}/bin/bun schema/codegen.ts
          '';
        in {
          default = mkShell {
            packages = [
              # runtime
              bun

              # database
              sqlite

              # tunnel
              cloudflared

              # nix
              nixd
              alejandra

              # custom tools
              compose
            ];
          };
        }
    );
  };
}

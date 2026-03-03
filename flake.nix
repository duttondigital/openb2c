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
              config.allowUnfree = true;
              overlays = [
                (final: prev: {
                  ols = prev.ols.overrideAttrs (old: {
                    version = "0-unstable-2026-02-12";
                    src = prev.fetchFromGitHub {
                      owner = "DanielGavin";
                      repo = "ols";
                      rev = "efc48e61d6112a8e545a1d07d1cea9ee99746d88";
                      hash = "sha256-3UoVMQuUol7vfSM57mj644XZ1CKmTz7+VuDSETT9NSE=";
                    };
                  });
                })
              ];
            };
          }
      );
  in {
    devShells = forEachSupportedSystem (
      {pkgs}:
        with pkgs; {
          default = mkShell {
            packages = [
              # odin
              odin
              ols

              # SSG
              zola

              # database
              sqlite

              # nix
              nixd
              alejandra
            ];
          };
        }
    );
  };
}

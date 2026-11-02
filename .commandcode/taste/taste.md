# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# git
- When creating GitHub repos, use the same name as the local project folder name. Confidence: 0.65

# release
- Expects release work to be finished end-to-end, not just built locally: bump the version, build the installer, and publish it to the auto-update channel (R2 bucket + `latest.json` manifest with signature) using the project's existing publish script. Confidence: 0.7
- "Do it properly" is a standing expectation that steps are actually completed and verified (e.g. confirm the published manifest/artifact is live and byte-identical to the local build), not merely reported. Confidence: 0.65


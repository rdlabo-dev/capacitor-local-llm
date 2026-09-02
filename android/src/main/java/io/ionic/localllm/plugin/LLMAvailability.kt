package io.ionic.localllm.plugin

enum class LLMAvailability(val value: String) {
    Available("available"),
    DeviceNotEligible("device-not-eligible"),
    NotEnabled("not-enabled"),
    Downloadable("downloadable"),
    Downloading("downloading"),
    NotReady("not-ready"),
    Unavailable("unavailable");

    val legacyValue: String
        get() = when (this) {
            Available -> "available"
            Downloadable -> "downloadable"
            Downloading, NotReady -> "notready"
            DeviceNotEligible, NotEnabled, Unavailable -> "unavailable"
        }
}

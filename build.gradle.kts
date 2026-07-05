plugins {
    id("org.jetbrains.intellij.platform") version "2.17.0"
}

group = "io.github.iceholic.noctis"
version = "0.2.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        val platformType = providers.gradleProperty("platformType")
        val platformVersion = providers.gradleProperty("platformVersion")
        create(platformType, platformVersion)
    }
}

intellijPlatform {
    buildSearchableOptions = false
    pluginConfiguration {
        id = "io.github.iceholic.noctis"
        name = "Noctis Theme"
        version = project.version.toString()
        description = """
            Noctis theme collection port for IntelliJ Platform IDEs.
        """.trimIndent()
        changeNotes = """
            <ul>
              <li>Fidelity pass against upstream VS Code Noctis: buttons, selections, status bar, menus, links, badges, checkboxes, scroll bars, banners.</li>
              <li>Fix editor scheme effect types, default text background, selection color, and align syntax mapping with upstream TextMate rules.</li>
            </ul>
        """.trimIndent()
        ideaVersion {
            sinceBuild = "233"
        }
        vendor {
            name = "iceholic"
            url = "https://github.com/iceholic/noctis-jetbrains"
        }
    }
}

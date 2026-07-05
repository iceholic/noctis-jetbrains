plugins {
    id("org.jetbrains.intellij.platform") version "2.17.0"
}

group = "com.noctis.intellij"
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
        id = "com.noctis.intellij"
        name = "Noctis"
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
            name = "Noctis JetBrains port"
            url = "https://github.com/liviuschera/noctis"
        }
    }
}

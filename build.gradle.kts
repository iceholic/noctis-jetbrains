plugins {
    id("org.jetbrains.intellij.platform") version "2.17.0"
}

group = "io.github.iceholic.noctis"
version = "0.2.1"

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
            <p>
              Noctis Theme brings the <a href="https://github.com/liviuschera/noctis">Noctis</a>
              color collection to IntelliJ Platform IDEs with coordinated editor schemes and IDE UI themes.
            </p>
            <ul>
              <li><b>11 Noctis variants</b>: Lux, Hibernus, Lilac, Noctis, Azureus, Bordo, Obscuro, Sereno, Uva, Viola, and Minimus.</li>
              <li><b>Full IDE surface coverage</b>: editor tabs, tool windows, status bar, lists, trees, tables, popups, forms, menus, VCS labels, and icon palette colors.</li>
              <li><b>Editor schemes included</b>: syntax colors, search highlights, diagnostics, diff/VCS lines, terminal colors, whitespace, caret, gutter, and line numbers.</li>
              <li><b>Light and dark themes</b> tuned from the upstream VS Code palette while following JetBrains UI conventions.</li>
            </ul>
            <p>
              View screenshots and source code on
              <a href="https://github.com/iceholic/noctis-jetbrains">GitHub</a>, or install from
              <a href="https://plugins.jetbrains.com/plugin/32673-noctis-theme/">JetBrains Marketplace</a>.
            </p>
        """.trimIndent()
        changeNotes = """
            <ul>
              <li>Expand the plugin Overview with theme coverage, editor scheme details, and project links.</li>
              <li>Refresh Marketplace metadata for the Noctis Theme listing.</li>
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

package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Test

class PrintStyleTest {

    @Test
    fun `a fresh ticket starts left aligned and normal weight`() {
        // printerInit resets both, so the first plain line needs no commands.
        assertEquals(emptyList<StyleChange>(), PrintStyle().changesFor(Align.LEFT, bold = false))
    }

    @Test
    fun `emits only the deltas`() {
        val style = PrintStyle()

        assertEquals(listOf(StyleChange.ALIGNMENT), style.changesFor(Align.CENTER, bold = false))
        style.commit(Align.CENTER, bold = false)

        assertEquals(listOf(StyleChange.BOLD_ON), style.changesFor(Align.CENTER, bold = true))
        style.commit(Align.CENTER, bold = true)

        assertEquals(emptyList<StyleChange>(), style.changesFor(Align.CENTER, bold = true))

        assertEquals(listOf(StyleChange.BOLD_OFF), style.changesFor(Align.CENTER, bold = false))
        style.commit(Align.CENTER, bold = false)

        assertEquals(listOf(StyleChange.ALIGNMENT), style.changesFor(Align.LEFT, bold = false))
    }

    @Test
    fun `reset forgets the tracked state`() {
        val style = PrintStyle()
        style.commit(Align.RIGHT, bold = true)
        style.reset()

        assertEquals(
            listOf(StyleChange.ALIGNMENT, StyleChange.BOLD_ON),
            style.changesFor(Align.RIGHT, bold = true),
        )
    }
}

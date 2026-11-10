package com.yooterminal.pos.printer

enum class StyleChange { ALIGNMENT, BOLD_ON, BOLD_OFF }

/**
 * Tracks the printer's current alignment and emphasis so only deltas are sent.
 *
 * A ticket is ~25 lines; re-sending alignment and font size on every line costs
 * ~50 redundant binder round-trips per ticket, which is visible on a slow V1.
 * `printerInit` resets the printer to left-aligned, normal weight, so that is
 * the starting assumption.
 */
class PrintStyle {

    private var alignment: Align = Align.LEFT
    private var bold: Boolean = false

    fun changesFor(align: Align, bold: Boolean): List<StyleChange> {
        val changes = mutableListOf<StyleChange>()
        if (alignment != align) changes += StyleChange.ALIGNMENT
        if (this.bold != bold) changes += if (bold) StyleChange.BOLD_ON else StyleChange.BOLD_OFF
        return changes
    }

    /** Call only after the changes have been applied successfully. */
    fun commit(align: Align, bold: Boolean) {
        alignment = align
        this.bold = bold
    }

    fun reset() {
        alignment = Align.LEFT
        bold = false
    }
}

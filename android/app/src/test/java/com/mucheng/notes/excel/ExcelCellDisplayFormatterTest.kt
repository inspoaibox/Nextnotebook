package com.mucheng.notes.excel

import com.mucheng.notes.domain.model.payload.ExcelCell
import com.mucheng.notes.presentation.excel.formatCellDisplayValue
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class ExcelCellDisplayFormatterTest : StringSpec({
    "uses desktop display cache before raw value" {
        val cell = ExcelCell(
            columnIndex = 0,
            value = JsonPrimitive(0.25),
            displayValue = JsonPrimitive("25.0%"),
            formula = "=A1/40"
        )

        formatCellDisplayValue(cell) shouldBe "25.0%"
    }

    "formats old payload number formats when display cache is missing" {
        val style = buildJsonObject {
            put("number_format", buildJsonObject {
                put("type", "percentage")
                put("decimals", 1)
            })
        }
        val cell = ExcelCell(
            columnIndex = 1,
            value = JsonPrimitive(0.25),
            formula = "=A1/40",
            style = style
        )

        formatCellDisplayValue(cell) shouldBe "25.0%"
    }

    "shows formula text only when no cached formula result exists" {
        val cell = ExcelCell(
            columnIndex = 2,
            value = JsonNull,
            formula = "=SUM(A1:A2)"
        )

        formatCellDisplayValue(cell) shouldBe "=SUM(A1:A2)"
    }

    "uses compact numeric display for plain numbers" {
        val cell = ExcelCell(
            columnIndex = 3,
            value = JsonPrimitive(42.0)
        )

        formatCellDisplayValue(cell) shouldBe "42"
    }
})

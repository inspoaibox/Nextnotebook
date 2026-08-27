package com.mucheng.notes.presentation.excel

import com.mucheng.notes.domain.model.payload.ExcelCell
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

fun formatCellDisplayValue(cell: ExcelCell): String {
    cell.displayValue?.let { displayValue ->
        val displayText = jsonElementToDisplayText(displayValue)
        if (displayText.isNotEmpty()) {
            return displayText
        }
    }

    val value = cell.value
    if (value == null || value is JsonNull) {
        return cell.formula.orEmpty()
    }

    val number = value.jsonPrimitiveOrNull()?.doubleOrNull
    val numberFormat = parseNumberFormat(cell.style)
    if (number != null && numberFormat != null) {
        return formatNumberValue(number, numberFormat)
    }

    return jsonElementToDisplayText(value)
}

private data class CellNumberFormat(
    val type: String,
    val decimals: Int = 0,
    val symbol: String = "",
    val pattern: String = ""
)

private fun parseNumberFormat(style: JsonElement?): CellNumberFormat? {
    val styleObject = style?.jsonObjectOrNull() ?: return null
    val formatObject = styleObject["number_format"]?.jsonObjectOrNull() ?: return null
    val type = formatObject["type"]?.jsonPrimitive?.contentOrNull ?: return null
    return CellNumberFormat(
        type = type,
        decimals = formatObject["decimals"]?.jsonPrimitive?.intOrNull ?: 0,
        symbol = formatObject["symbol"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        pattern = formatObject["pattern"]?.jsonPrimitive?.contentOrNull.orEmpty()
    )
}

private fun formatNumberValue(value: Double, format: CellNumberFormat): String {
    return when (format.type) {
        "percentage" -> "${decimalFormat(format.decimals).format(value * 100)}%"
        "currency" -> "${format.symbol}${decimalFormat(format.decimals).format(value)}"
        "number" -> decimalFormat(format.decimals).format(value)
        "date" -> formatExcelDate(value, format.pattern)
        else -> compactNumber(value)
    }
}

private fun decimalFormat(decimals: Int): DecimalFormat {
    val safeDecimals = decimals.coerceIn(0, 10)
    val pattern = if (safeDecimals == 0) "#,##0" else "#,##0.${"0".repeat(safeDecimals)}"
    return DecimalFormat(pattern, DecimalFormatSymbols(Locale.US))
}

private fun compactNumber(value: Double): String {
    val longValue = value.toLong()
    return if (value == longValue.toDouble()) longValue.toString() else value.toString()
}

private fun formatExcelDate(value: Double, pattern: String): String {
    val date = LocalDate.of(1899, 12, 30).plusDays(value.toLong())
    val formatter = when {
        pattern.contains("/", ignoreCase = true) -> DateTimeFormatter.ofPattern("M/d/yyyy")
        pattern.contains("年", ignoreCase = true) -> DateTimeFormatter.ofPattern("yyyy年M月d日")
        else -> DateTimeFormatter.ISO_LOCAL_DATE
    }
    return date.format(formatter)
}

private fun jsonElementToDisplayText(element: JsonElement): String {
    return when (element) {
        is JsonNull -> ""
        is JsonPrimitive -> {
            element.booleanOrNull?.let { if (it) "TRUE" else "FALSE" }
                ?: element.doubleOrNull?.let { compactNumber(it) }
                ?: element.content
        }
        else -> element.toString()
    }
}

private fun JsonElement.jsonPrimitiveOrNull(): JsonPrimitive? = this as? JsonPrimitive

private fun JsonElement.jsonObjectOrNull() = runCatching { jsonObject }.getOrNull()

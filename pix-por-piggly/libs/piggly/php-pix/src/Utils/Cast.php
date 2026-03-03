<?php

namespace Piggly\WooPixGateway\Vendor\Piggly\Pix\Utils;

use Piggly\WooPixGateway\Vendor\Piggly\Pix\Exceptions\InvalidEmvFieldException;
/**
 * Cast data to another format.
 *
 * @package \Piggly\Pix
 * @subpackage \Piggly\Pix\Utils
 * @version 2.0.0
 * @since 2.0.0
 * @category Util
 * @author Caique Araujo <caique@piggly.com.br>
 * @author Piggly Lab <dev@piggly.com.br>
 * @license MIT
 * @copyright 2021 Piggly Lab <dev@piggly.com.br>
 */
class Cast
{
    /**
     * Replace acents and remove any invalid char
     * from $str.
     *
     * By default, allow only chars: A-Z, a-z, 0-9, (space) and -.
     * When $allowDigits is set to FALSE, will allow only the
     * following chars: A-Z, a-z, and (space).
     *
     * @param string $str
     * @param boolean $allowDigits
     * @since 2.0.0
     * @return string
     */
    public static function cleanStr(string $str, bool $allowDigits = \true) : string
    {
        $invalid = array("Á", "À", "Â", "Ä", "Ă", "Ā", "Ã", "Å", "Ą", "Æ", "Ć", "Ċ", "Ĉ", "Č", "Ç", "Ď", "Đ", "Ð", "É", "È", "Ė", "Ê", "Ë", "Ě", "Ē", "Ę", "Ə", "Ġ", "Ĝ", "Ğ", "Ģ", "á", "à", "â", "ä", "ă", "ā", "ã", "å", "ą", "æ", "ć", "ċ", "ĉ", "č", "ç", "ď", "đ", "ð", "é", "è", "ė", "ê", "ë", "ě", "ē", "ę", "ə", "ġ", "ĝ", "ğ", "ģ", "Ĥ", "Ħ", "Í", "Ì", "İ", "Î", "Ï", "Ī", "Į", "Ĳ", "Ĵ", "Ķ", "Ļ", "Ł", "Ń", "Ň", "Ñ", "Ņ", "Ó", "Ò", "Ô", "Ö", "Õ", "Ő", "Ø", "Ơ", "Œ", "ĥ", "ħ", "ı", "í", "ì", "î", "ï", "ī", "į", "ĳ", "ĵ", "ķ", "ļ", "ł", "ń", "ň", "ñ", "ņ", "ó", "ò", "ô", "ö", "õ", "ő", "ø", "ơ", "œ", "Ŕ", "Ř", "Ś", "Ŝ", "Š", "Ş", "Ť", "Ţ", "Þ", "Ú", "Ù", "Û", "Ü", "Ŭ", "Ū", "Ů", "Ų", "Ű", "Ư", "Ŵ", "Ý", "Ŷ", "Ÿ", "Ź", "Ż", "Ž", "ŕ", "ř", "ś", "ŝ", "š", "ş", "ß", "ť", "ţ", "þ", "ú", "ù", "û", "ü", "ŭ", "ū", "ů", "ų", "ű", "ư", "ŵ", "ý", "ŷ", "ÿ", "ź", "ż", "ž");
        $valid = array("A", "A", "A", "A", "A", "A", "A", "A", "A", "AE", "C", "C", "C", "C", "C", "D", "D", "D", "E", "E", "E", "E", "E", "E", "E", "E", "G", "G", "G", "G", "G", "a", "a", "a", "a", "a", "a", "a", "a", "a", "ae", "c", "c", "c", "c", "c", "d", "d", "d", "e", "e", "e", "e", "e", "e", "e", "e", "g", "g", "g", "g", "g", "H", "H", "I", "I", "I", "I", "I", "I", "I", "IJ", "J", "K", "L", "L", "N", "N", "N", "N", "O", "O", "O", "O", "O", "O", "O", "O", "CE", "h", "h", "i", "i", "i", "i", "i", "i", "i", "ij", "j", "k", "l", "l", "n", "n", "n", "n", "o", "o", "o", "o", "o", "o", "o", "o", "o", "R", "R", "S", "S", "S", "S", "T", "T", "T", "U", "U", "U", "U", "U", "U", "U", "U", "U", "U", "W", "Y", "Y", "Y", "Z", "Z", "Z", "r", "r", "s", "s", "s", "s", "B", "t", "t", "b", "u", "u", "u", "u", "u", "u", "u", "u", "u", "u", "w", "y", "y", "y", "z", "z", "z");
        $str = \str_ireplace($invalid, $valid, $str);
        $str = $allowDigits ? \preg_replace('/[^A-Za-z\\ \\0-9\\-]+/', '', $str) : \preg_replace('/[^A-Za-z\\ ]+/', '', $str);
        return $str;
    }
    /**
     * Cut $str length to $maxLength.
     *
     * When $throw is set to TRUE, then will throw
     * an exception if $str length is greater than
     * $maxLength instead cutting.
     *
     * @param string $field
     * @param string $str
     * @param int $maxLength
     * @param bool $throw
     * @since 2.0.0
     * @return string
     */
    public static function cutStr(string $field, string $str, int $maxLength = 25, bool $throw = \false) : string
    {
        if (\strlen($str) <= $maxLength) {
            return $str;
        }
        if ($throw) {
            throw new InvalidEmvFieldException($field, $str, \sprintf('Excede o limite de %s caracteres.', $maxLength));
        }
        return \substr($str, 0, $maxLength);
    }
    /**
     * $str to uppercase.
     *
     * @param string $str
     * @since 2.0.0
     * @return string
     */
    public static function upperStr(string $str) : string
    {
        return \strtoupper($str);
    }
}

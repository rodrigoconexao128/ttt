<?php

// Get Form Data
$name    = $_POST["name"];
$email   = $_POST["email"];
$company = $_POST["company"];
$subject = $_POST["subject"];
$message = $_POST["message"];

// Email To
$mailTo = "demo.qoorasa@gmail.com";

// Email Title
$title = "New Message Received";

// Email Body Text
$field .= "Name: ";
$field .= $name;
$field .= "\n";

$field.= "Email: ";
$field .= $email;
$field .= "\n";

$field.= "Company: ";
$field .= $company;
$field .= "\n";

$field.= "Subject: ";
$field .= $subject;
$field .= "\n";

$field .= "Message: ";
$field .= $message;
$field .= "\n";

// Send Email
$success = mail($mailTo,  $title,  $field, "From:".$email);

?>
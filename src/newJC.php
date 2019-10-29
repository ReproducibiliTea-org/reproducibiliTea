<?php
/**
 * Created by PhpStorm.
 * User: MJ
 * Date: 23/10/2019
 * Time: 11:33
 */

require('secret.php');

error_reporting(E_ERROR);

/**
 * Class Status
 * Allows for neat handling of individual components
 */
class Status {
    public $task;
    public $status;
    public $info = array();
    public $error = array();
    public $warning = array();

    /**
     * Status constructor.
     * @param $task {string} task description
     * @param null $input {null|array()} associative array of info, error, and warning strings to include
     */
    public function __construct($task, $input = null)
    {
        $this->task = array($task);
        if(!is_null($input)) {
            foreach($input as $key=>$value) {
                if(property_exists('Status', $key)) {
                    if($key === 'status')
                        $this->status = $value;
                    else
                        $this[$key][] = $value;
                }
            }
        }
    }
}

$status = array();

function done() {
    global $status;
    die(json_encode($status));
}


// Check inputs
$status['inputCheck'] = new Status(
    'Check submitted information',
    array('status' => "Rejected")
    );

// Check auth code
if(!isset($_POST["auth-code"]) ||
    $_POST["auth-code"] !== secrets["authCode"]) {
    http_response_code(403);
    $status['inputCheck']->error[] = 'The submitted authorisation code does not match our records';
    done();
}

// Check form data has mandatory fields
$requiredKeys = [
    'jcid',
    'name',
    'uni',
    'uni-www',
    'email',
    'post',
    'country',
    'lead'
];

foreach($requiredKeys as $keyName) {
    if(!array_key_exists($keyName, $_POST)) {
        http_response_code(400);
        $status['inputCheck']->error[] = "The request is missing mandatory field '$keyName'";
        done();
    }
}

// Bind and clean values
$id = strtolower($_POST["jcid"]);
$name = $_POST["name"];
$uni = $_POST["uni"];
$uniWWW = $_POST["uni-www"];
$email = $_POST["email"];
if(!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    $status['inputCheck']->error[] = "The submitted email, $email, failed format validation";
    done();
}
$post = $_POST["post"];
$country = $_POST["country"];
$lead = $_POST["lead"];

$www = $_POST["www"];
$twitter = $_POST["twitter"];
$signup = $_POST["signup"];
$description = $_POST["description"];

$helpers = array();
$i = 0;
while(isset($_POST["helper$i"])) {
    array_push($helpers, $_POST["helper$i"]);
    $i++;
}

$helperCSV = $i? join(', ', $helpers) : "";

if(preg_match('/$[a-z0-9]+^/', $id) !== 0) {
    http_response_code(400);
    $status['inputCheck']->error[] = "The id field contains invalid characters";
    done();
}

$status['inputCheck']->status = "Okay";
$status['inputCheck']->info[] = "All inputs okay";


// Open Science Framework
$status['OSF'] = new Status('Create OSF repository');


// Check for OSF repository with the appropriate name
$url = "https://api.test.osf.io/v2/nodes/?filter[title]=$name";

$handle = curl_init($url);
curl_setopt($handle, CURLOPT_HTTPHEADER, array(
    'Authorization: Bearer ' . secrets['osfToken']
));
curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);

$result = curl_exec($handle);
$node = json_decode($result);

curl_close($handle);

if(sizeof($node->data) > 0 &&
    array_key_exists('id', $node->data[0])) {
    // Found a match, issue a warning and continue.
    $status['OSF']->status = "Skipped";
    $status['OSF']->warning[] = "An OSF repository with a similar name already exists: a new one will not be created";
    $OSFid = $node->data[0]->id;
} else {
    // Create new OSF repository
    $url = "https://api.test.osf.io/v2/nodes/";

    $content =array(
        'data' => array(
            'type' => 'nodes',
            'attributes' => array(
                'title' => 'ReproducibiliTea ' . $name,
                'category' => 'other',
                'description' => "Materials from ReproducibiliTea sessions in $name. Templates and presentations are available for others to use and edit."
            ),
            'relationships' => array(
                'root' => array(
                    'data' => array(
                        'type' => 'nodes',
                        'id' => '384cb'
                    ),
                    'links' => array(
                        'related' => array(
                            'href' => 'https://test.osf.io/384cb/'
                        )
                    )
                )
            )
        )
    );

    $headers = [
        'Content-Type: application/vnd.api+json',
        'Accept: application/vnd.api+json',
        'Authorization: Bearer ' . secrets['osfToken'],
        'Content-Length: ' . strlen(json_encode($content))
    ];

    $handle = curl_init($url);
    curl_setopt($handle, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($handle, CURLOPT_CUSTOMREQUEST, "POST");
    curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($content));

    $try = curl_exec($handle);

    $result = json_decode($try);

    curl_close($handle);

    $OSFid = $result->data->id;

    if(!$OSFid) {
        $status['OSF']->status = "Failed";
        $status['OSF']->error[] = 'Unable to create repository';
        done();
    } else {
        $status['OSF']->status = "Okay";
        $status['OSF']->info[] = "OSF repository in place at <a href='https://osf.io/$OSFid'>https://osf.io/$OSFid</a>. You may need to apply to a ReproducibiliTea organiser for access";
    }
}


// Invite lead organiser to Slack Workspace
// Apparently we need Enterprise (premium) to do this, so we don't
$status['slack'] = new Status('Invite lead organiser to Slack');
$status['slack']->status = "Failed";
$status['slack']->error[] = "We can't invite users to Slack automatically at the moment. Instead, please join using this link: <a href='". secrets['slackLink'] ."'>" . secrets['slackLink'] ."</a>. You will not see this link again, so please do this <strong>now</strong>";

//
//$handle = curl_init("https://slack.com/api/admin.users.invite?token=".secrets['slackToken']."&email=$email&channel_ids=CJ594UQTA&team_id=TJ7DABB1C&resend=true&real_name=".urlencode($lead));
//curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
//$try = curl_exec($handle);
//$result = json_decode($try);
//
//curl_close($handle);
//
//if(!is_null($result) && $result->ok) {
//    $status['slack']->status = "Okay";
//    $status['slack']->info[] = "Invite sent to <em>$email</em>";
//} else {
//    $status['slack']->status = "Failed";
//    $status['slack']->error[] = "Unable to send Slack invite. Please ask a ReproducibiliTea organiser for an invitation";
//}


// Create Zotero subcollection
$status['zotero'] = new Status('Create Zotero subcollection');

$url = "https://api.zotero.org/groups/2354006/collections";

// Check whether collection with this name exists
$skipZotero = false;

$handle = curl_init($url);
curl_setopt($handle, CURLOPT_HTTPHEADER, array('Zotero-API-Version: 3'));
curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);

$try = curl_exec($handle);

$result = json_decode($try);

foreach($result as $item) {
    if($item->data->parentCollection === false &&
        $item->data->name === $name) {
        $skipZotero = true;
        $status['zotero']->status = "Skipped";
        $status['zotero']->warning[] = "Collection '$name' already exists: a duplicate will not be created";
        break;
    }
}

if(!$skipZotero) {
    // Create new collection
    $content =array(
        array(
            'name' => $name,
            'parentCollection' => false
        )
    );

    $headers = [
        'Zotero-API-Version: 3',
        'Content-Type: application/json',
        'Authorization: Bearer ' . secrets['zoteroToken'],
        'Content-Length: ' . strlen(json_encode($content))
    ];

    $handle = curl_init($url);
    curl_setopt($handle, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($handle, CURLOPT_CUSTOMREQUEST, "POST");
    curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($content));

    $try = curl_exec($handle);

    $result = json_decode($try);

    curl_close($handle);

    if(!is_null($result) && !is_null($result->success)) {
        $zotero = (array) $result->success;
        $zotero = $zotero[0];

        $status['zotero']->status = "Okay";
        $status['zotero']->info[] = "Created Zotero collection '$name' at <a href='https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/$zotero'>https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/$zotero</a>";
    } else {
        $status['zotero']->status = "Failed";
        $status['zotero']->error = "Could not create subcollection";
    }
}


// GitHub
$status['GitHub'] = new Status('Create web page on GitHub');

// Check whether a file with this name exists already
$url = 'https://api.github.com/repos/mjaquiery/reproducibiliTea/contents/_journal-clubs';

$opts = array('http' =>
    array(
        'header'  => 'User-Agent: mjaquiery', // GitHub requires a valid useragent
        'method'  => 'GET'
    )
);

$context = stream_context_create($opts);
$result = file_get_contents($url, false, $context);

$createGitHub = true;

if(!$result) {
    $status['GitHub']->info[] = "Failed";
    $status['GitHub']->error[] = "Unable to contact GitHub API";
    $createGitHub = false;
} else {
    $JCs = json_decode($result);

    foreach($JCs as $JC) {
        if($JC->name === $id.'.md') {
            $createGitHub = false;
            $status['GitHub']->status = "Skipped";
            $status['GitHub']->warning[] = "$id.md already exists: a new version will not be created";
            break;
        }
    }
}

if($createGitHub) {
    // Create JC.md file and issue pull request on GitHub
    $organisers = strlen($helperCSV)? $lead . ', ' . $helperCSV : $lead;
    $file = base64_encode(<<<FILE
---
title: $name
host-organisation: $uni
host-org-url: $uniWWW
osf: $OSFid
zotero: $zotero
website: $www
twitter: $twitter
signup: $signup
organisers: [$organisers]
contact: $email
address: $post
country: $country
---

$description

FILE
    );

    $url = 'https://api.github.com/repos/mjaquiery/reproducibiliTea/contents/_journal-clubs/' . $id . '.md';

    $content = array(
        'message' => 'API creation of ' . $id . '.md',
        'content' => $file
    );

    $headers = [
        'User-Agent: mjaquiery',
        'Authorization: token ' . secrets['GitHubToken'],
        'Content-Length: ' . strlen(json_encode($content))
    ];

    $handle = curl_init($url);
    curl_setopt($handle, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($handle, CURLOPT_CUSTOMREQUEST, "PUT");
    curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($content));

    $try = curl_exec($handle);

    $result = json_decode($try);

    curl_close($handle);

    if(is_null($result) ||
        sizeof($result) < 1 ||
        sizeof($result->content) < 1 ||
        $result->content->name !== $id .'md') {
        $status['GitHub']->status = "Failed";
        $status['GitHub']->error[] = "Unable to create file";
    } else {
        $status['GitHub']->status = "Okay";
        $status['GitHub']->info[] = "Created '$id.md'";
        $status['GitHub']->info[] = "Webpage will shortly be available at <a href='https://reproducibiliTea.org/journal-clubs/#$id'>https://reproducibiliTea.org/journal-clubs/#$id</a>";
    }
}


// Email results of this process to ReproducibiliTea
$now = new DateTime();
$now = $now->format(DATE_RFC1123);
$text = <<<REPORT
<p>Our automatic creation process was engaged at $now.</p>
<h1>Report</h1>
REPORT;

foreach($status as $key=>$value) {
    $text .= <<<REPORT
<h2>$key:</h2>
<p><strong>Status:</strong> $value->status</p>
REPORT;

    foreach($value as $arr=>$val) {
        if(!is_array($val) || sizeof($val) === 0)
            continue;

        $text .= "<p><strong>$arr:</strong><br/>" . join('<br/>', $val) . "</p>";
    }
}

// To send HTML mail, the Content-type header must be set
$headers = array(
    'MIME-Version: 1.0',
    'Content-type: text/html; charset=iso-8859-1',
    'To: reproducibiliTea@gmail.com',
    'From: reproducibiliTea@gmail.com',
    'Bcc: ' . join(' ', secrets['emailReportTo'])
);

// Mail it
//mail('', "ReproducibiliTea JC Creation API Report ($id)", $text, implode("\r\n", $headers));

done();
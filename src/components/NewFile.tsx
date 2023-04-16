import { useMemo, useState } from "react";

import {
  useMultiStyleConfig,
  useToast,
  Flex,
  Heading,
  Text,
  Code,
  Input,
  InputGroup,
  InputRightElement,
  Image,
  Checkbox,
  CheckboxGroup,
  Button,
  IconButton,
} from "@chakra-ui/react";
import { AttachmentIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";

import { VoidCat } from "../upload";
import { pool } from "../nostr";
import { getBlurhashFromFile, BlurhashImage } from "../blur";

export const FileInput = (props: InputProps) => {
  const styles = useMultiStyleConfig("Button", { variant: "unstyled" });

  return (
    <Input
      type="file"
      sx={{
        "::file-selector-button": {
          border: "none",
          outline: "none",
          mr: 2,
          ...styles,
        },
      }}
      {...props}
    />
  );
};

function FilePreview({ file }) {
  const fileType = file.type;
  const url = URL.createObjectURL(file);

  if (fileType.startsWith("image")) {
    return <img key={file.name} src={url} alt={file.name} />;
  } else if (fileType.startsWith("audio")) {
    return <audio key={file.name} controls src={url} />;
  } else if (fileType.startsWith("video")) {
    return <video key={file.name} controls src={url} />;
  } else {
    return <Text>Unsupported file type: {fileType}</Text>;
  }
}

function Preview({ file, blurhash }) {
  const [blur, setBlur] = useState(false);
  return (
    <Flex flexDirection="column">
      <Flex justifyContent="space-between">
        <Heading>Preview</Heading>
        {blurhash && (
          <IconButton
            icon={blur ? <ViewIcon /> : <ViewOffIcon />}
            variant="untstyled"
            onClick={() => setBlur(!blur)}
          />
        )}
      </Flex>
      {file && !blur && <FilePreview file={file} />}
      {blurhash?.blurhash && blur && (
        <BlurhashImage
          blurhash={blurhash.blurhash}
          width={blurhash.width}
          height={blurhash.height}
          alt={name}
        />
      )}
    </Flex>
  );
}

function RelaySelector({ relays, onSelect }) {
  const [publishOn, setPublishOn] = useState(
    relays.reduce((acc, url) => {
      return { [url]: true };
    }, {})
  );

  function update(url, checked) {
    setPublishOn((acc) => {
      const newState = { ...acc, [url]: checked };
      onSelect(newState);
      return newState;
    });
  }

  return (
    <Flex flexDirection="column">
      {relays.map((url) => (
        <Checkbox
          key={url}
          value={publishOn[url]}
          onChange={(e) => update(url, e.target.checked)}
        >
          {url}
        </Checkbox>
      ))}
    </Flex>
  );
}

export const NewFile = ({ onSuccess, onCancel, relays }) => {
  const toast = useToast();
  const [publishOn, setPublishOn] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [blurhash, setBlurhash] = useState();
  const [file, setFile] = useState();
  const [upload, setUpload] = useState();
  const hashtags = tags
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length !== 0);
  const publishTo = Object.entries(publishOn)
    .filter(([url, publish]) => publish)
    .map(([url]) => url);

  const ev = useMemo(() => {
    const { url, file } = upload ?? {};
    const { metadata } = file ?? {};
    const event = {
      kind: 1063,
      content: name,
      tags: [],
    };
    if (url) {
      event.tags.push(["url", url]);
    }
    if (metadata) {
      event.tags.push(["m", metadata.mimeType]);
      event.tags.push(["x", metadata.digest]);
      event.tags.push(["size", String(metadata.size)]);
    }
    if (metadata?.magnetLink) {
      // todo: `i` torrent infohash
      event.tags.push(["magnet", metadata.magnetLink]);
    }
    if (blurhash?.blurhash) {
      event.tags.push(["blurhash", blurhash.blurhash]);
    }
    if (hashtags.length > 0) {
      hashtags.forEach((t) => {
        event.tags.push(["t", t]);
      });
    }
    return event;
  }, [upload, blurhash, hashtags]);

  async function onFileChange(e) {
    const file = e.target.files[0];
    setFile(file);
    try {
      const blurhash = await getBlurhashFromFile(file);
      setBlurhash(blurhash);
    } catch (error) {
      console.error("Couldn't get blurhash");
    }
    setName(file.name);
  }
  async function uploadFile() {
    try {
      setIsUploading(true);
      const upload = await VoidCat(file, name);
      if (upload.error) {
        toast({
          title: "Error uploading file",
          status: "error",
          description: upload.error,
        });
      } else {
        setUpload(upload);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  }

  async function publishOnNostr() {
    const timestamp = { ...ev, created_at: Math.floor(Date.now() / 1000) };
    try {
      const signed = await window.nostr.signEvent(timestamp);
      pool.publish(signed, publishTo);
      onSuccess();
    } catch (error) {
      console.error(error);
      toast({
        title: "Couldn't sign event",
        status: "error",
        description:
          "Use a nostr extension such as nos2x or Alby to sign messages",
      });
    }
  }

  return (
    <>
      <Heading>New file</Heading>
      <FileInput onChange={onFileChange} />
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Description"
      />
      <Input
        type="text"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="A list of tags: illustration, coffee"
      />
      <Preview file={file} blurhash={blurhash} />
      <Button
        isDisabled={!file || isUploading}
        isLoading={isUploading}
        onClick={uploadFile}
      >
        Upload to void.cat
      </Button>
      <Heading>Nostr event</Heading>
      <Code>{JSON.stringify(ev, null, 2)}</Code>
      <RelaySelector relays={relays} onSelect={setPublishOn} />
      <Flex width="100%">
        {onCancel && (
          <Button onClick={onCancel} mr={2}>
            Cancel
          </Button>
        )}
        <Button
          colorScheme="purple"
          isDisabled={!upload}
          onClick={publishOnNostr}
        >
          Publish on nostr
        </Button>
      </Flex>
    </>
  );
};
